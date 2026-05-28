import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { cancelDaycareCheckIn } from "@/lib/daycareCancelCheckIn";
import { appendDogSizeToNotes } from "@/lib/dogSizeNotes";
import { composeNotesWithBillingPath, isDaycareHourlyPending, isHourlyBillingDraft, parseHourlyDraftId, type DaycareBillingPath } from "@/lib/daycareSessionMeta";
import { DAYCARE_CREDIT_CODES } from "@/lib/daycareCredits";
import { ownerMemberTierFromFlags, type OwnerMemberTier } from "@/lib/memberTier";

type DaycareSession = Database["public"]["Tables"]["daycare_sessions"]["Row"];
type DaycareSessionInsert = Database["public"]["Tables"]["daycare_sessions"]["Insert"];
type ServiceCode = Database["public"]["Enums"]["service_code"];

export type DaycareCredit = Database["public"]["Tables"]["service_credits"]["Row"] & {
  package_name?: string | null;
};

export type DaycarePackage = {
  id: string;
  owner_id: string;
  pet_id: string;
  total_days: number;
  days_used: number;
  expiry_date: string | null;
  purchase_date: string | null;
  package_name: string | null;
  service_code: ServiceCode;
  is_bonus: boolean;
  units_remaining: number;
  status: string;
  is_expired: boolean;
  source_ref_id: string | null;
  redemption_group_id: string | null;
};

export type { DaycareSession };

type CreditRpcRow = Database["public"]["Functions"]["list_active_credits_for_pet"]["Returns"][number];

type PurchaseGroupJoin = {
  staff_label?: string | null;
  package_definitions?: { display_name?: string | null } | null;
} | null;

function creditPackageDisplayName(purchaseGroups: PurchaseGroupJoin): string | null {
  const label = purchaseGroups?.staff_label?.trim();
  if (label) return label;
  return purchaseGroups?.package_definitions?.display_name ?? null;
}

export const daycareQueryKeys = {
  packages: (ownerId?: string) => ["service_credits", "daycare", ownerId ?? "all"] as const,
  packagesByPet: (petId: string) => ["service_credits", "daycare", "pet", petId] as const,
  sessions: (date?: string) => ["daycare_sessions", date ?? "all"] as const,
  sessionsByPet: (petId: string) => ["daycare_sessions", "pet", petId] as const,
  sessionsByOwner: (ownerId: string) => ["daycare_sessions", "owner", ownerId] as const,
  creditsByPet: (petId: string) => ["service_credits", "active", petId] as const,
};

export type DaycareSessionWithDetails = DaycareSession & {
  pets: { name: string; species: string } | null;
  owners: { first_name: string; last_name: string } | null;
};

export type AttendancePayload = {
  pickup_used?: boolean;
  dropoff_used?: boolean;
  logged_by?: string | null;
  remark?: string | null;
};

export function useDaycarePackages(ownerId: string) {
  return useQuery({
    queryKey: daycareQueryKeys.packages(ownerId),
    enabled: !!ownerId,
    queryFn: async () => {
      const { data: petRows, error: petsErr } = await supabase
        .from("pets")
        .select("id")
        .eq("owner_id", ownerId);
      if (petsErr) throw petsErr;

      const petIds = (petRows ?? []).map((p) => p.id);
      if (petIds.length === 0) return [] as DaycarePackage[];

      const { data, error } = await supabase
        .from("service_credits")
        .select("*, purchase_groups(staff_label, package_definitions(display_name))")
        .in("pet_id", petIds)
        .in("service_code", DAYCARE_CREDIT_CODES)
        .eq("is_bonus", false)
        .in("status", ["active", "expired"])
        .order("expires_at", { ascending: true });
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      return (data ?? [])
        .filter((row) => row.units_total - row.units_consumed > 0)
        .map((row) => {
        const packageName = creditPackageDisplayName(
          (row as unknown as { purchase_groups?: PurchaseGroupJoin }).purchase_groups ?? null,
        );
        const expiryDate = row.expires_at;
        return {
          id: row.id,
          owner_id: ownerId,
          pet_id: row.pet_id,
          total_days: row.units_total,
          days_used: row.units_consumed,
          expiry_date: expiryDate,
          purchase_date: row.created_at,
          package_name: packageName,
          service_code: row.service_code,
          is_bonus: row.is_bonus,
          status: row.status,
          units_remaining: row.units_total - row.units_consumed,
          is_expired: !!expiryDate && expiryDate < today,
          source_ref_id: row.source_ref_id,
          redemption_group_id: row.redemption_group_id,
        };
      }) as DaycarePackage[];
    },
  });
}

export function usePetDaycareCredits(petId: string) {
  return useQuery({
    queryKey: daycareQueryKeys.creditsByPet(petId),
    enabled: !!petId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_active_credits_for_pet", {
        p_pet_id: petId,
        p_service_code: null,
      });
      if (error) throw error;
      return ((data ?? []) as CreditRpcRow[]).filter((row) =>
        DAYCARE_CREDIT_CODES.includes(row.service_code),
      );
    },
  });
}

export function useConsumeServiceCredit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      creditId,
      units = 1,
      consumedForRefId = null,
      consumedForRefType = null,
      allowExpired = false,
    }: {
      creditId: string;
      units?: number;
      consumedForRefId?: string | null;
      consumedForRefType?: string | null;
      allowExpired?: boolean;
    }) => {
      const { data, error } = await supabase.rpc("consume_service_credit", {
        p_credit_id: creditId,
        p_units: units,
        p_consumed_for_ref_id: consumedForRefId,
        p_consumed_for_ref_type: consumedForRefType,
        p_allow_expired: allowExpired,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
      queryClient.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

export function useDaycareSessionsByDate(date: string) {
  return useQuery({
    queryKey: daycareQueryKeys.sessions(date),
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daycare_sessions")
        .select("*, pets(name, species), owners(first_name, last_name)")
        .eq("session_date", date)
        .order("checked_in_at", { ascending: true });
      if (error) throw error;
      return data as DaycareSessionWithDetails[];
    },
  });
}

export function useDaycareSessionsByPet(petId: string) {
  return useQuery({
    queryKey: daycareQueryKeys.sessionsByPet(petId),
    enabled: !!petId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daycare_sessions")
        .select("*")
        .eq("pet_id", petId)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DaycareSession[];
    },
  });
}

// ── useMarkSessionAttended ────────────────────────────────────────────────────

export type MarkAttendedPayload = AttendancePayload & {
  sessionId:  string;
  package_id?: string | null;
};

/**
 * Marks an existing daycare session as attended:
 *   - Sets checked_in=true, checked_in_at=now()
 *   - Persists pickup_used, dropoff_used, logged_by, remark(→notes)
 *   - Increments days_used on the linked package by 1
 */
export function useMarkSessionAttended() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      package_id,
      remark,
      pickup_used,
      dropoff_used,
      logged_by,
    }: MarkAttendedPayload) => {
      const updateObj = {
        checked_in:    true,
        checked_in_at: new Date().toISOString(),
        ...(remark       !== undefined && { notes:        remark       }),
        ...(pickup_used  !== undefined && { pickup_used:  pickup_used  }),
        ...(dropoff_used !== undefined && { dropoff_used: dropoff_used }),
        ...(logged_by    !== undefined && { logged_by:    logged_by    }),
      };

      const { data: session, error: sessionErr } = await supabase
        .from("daycare_sessions")
        // cast until types.ts is regenerated to include the new columns
        .update(updateObj as unknown as Database["public"]["Tables"]["daycare_sessions"]["Update"])
        .eq("id", sessionId)
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      return session as DaycareSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
    },
  });
}

// ── useAddDaycareDay ──────────────────────────────────────────────────────────

export type AddDaycareDayPayload = AttendancePayload & {
  session_date: string;
  pet_id:       string;
  owner_id:     string;
  package_id?:  string | null;
  /** When package_id is null, persisted in session notes as BILLING_PATH metadata. */
  billing_path?: DaycareBillingPath | null;
  /** Client-selected check-in timestamp; defaults to now when omitted. */
  checked_in_at?: string | null;
  /**
   * When set with package_id, consumes this many package units after the session is
   * created (planner "Add Day"). Rolls back the session if consumption fails.
   * Check-in uses separate consumption so hourly units can be applied there.
   */
  credit_units?: number;
  /** Allow consuming credits past expires_at (daycare staff override). */
  allow_expired_credit?: boolean;
  /** Client-selected size label (Small / Medium / Large / Extra Large). */
  dog_size?: string | null;
};

/**
 * Inserts a new daycare_session row already marked as attended (checked_in=true).
 */
export function useAddDaycareDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      session_date,
      pet_id,
      owner_id,
      package_id,
      remark,
      pickup_used,
      dropoff_used,
      logged_by,
      dog_size,
      credit_units,
      billing_path,
      checked_in_at,
      allow_expired_credit,
    }: AddDaycareDayPayload) => {
      // Prevent duplicate same-day check-ins for the same pet.
      const { data: existing, error: existingErr } = await supabase
        .from("daycare_sessions")
        .select("id")
        .eq("pet_id", pet_id)
        .eq("session_date", session_date)
        .limit(1);

      if (existingErr) throw existingErr;
      if ((existing?.length ?? 0) > 0) {
        throw new Error("Pet is already checked in for this date");
      }

      const baseNotes = appendDogSizeToNotes(remark ?? null, dog_size);
      const notes =
        !package_id && billing_path
          ? composeNotesWithBillingPath(baseNotes, billing_path)
          : baseNotes;

      const insert = {
        session_date,
        pet_id,
        owner_id,
        package_id: package_id ?? null,
        checked_in: true,
        checked_in_at: checked_in_at ?? new Date().toISOString(),
        notes,
        pickup_used: pickup_used ?? false,
        dropoff_used: dropoff_used ?? false,
        logged_by: logged_by ?? null,
      } as DaycareSessionInsert;

      const { data: session, error } = await supabase
        .from("daycare_sessions")
        .insert(insert)
        .select()
        .single();

      if (error) throw error;

      if (package_id && credit_units != null && credit_units > 0) {
        const { error: consumeErr } = await supabase.rpc("consume_service_credit", {
          p_credit_id: package_id,
          p_units: credit_units,
          p_consumed_for_ref_id: session.id,
          p_consumed_for_ref_type: "daycare_session",
          p_allow_expired: allow_expired_credit ?? false,
        });
        if (consumeErr) {
          await supabase.from("daycare_sessions").delete().eq("id", session.id);
          throw new Error(
            consumeErr.message?.trim() || "Could not deduct package credit for this day",
          );
        }
      }

      return session as DaycareSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
    },
  });
}

// ── useDeleteDaycareSession ───────────────────────────────────────────────────

// ── useUpdateDaycareSession ───────────────────────────────────────────────────

export type UpdateSessionPayload = AttendancePayload & { sessionId: string };

/**
 * Updates attendance detail fields on an existing session WITHOUT changing
 * days_used on the package. Use this for inline edits in the planner.
 */
export function useUpdateDaycareSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      remark,
      pickup_used,
      dropoff_used,
      logged_by,
    }: UpdateSessionPayload) => {
      const updateObj = {
        ...(remark       !== undefined && { notes:        remark       }),
        ...(pickup_used  !== undefined && { pickup_used:  pickup_used  }),
        ...(dropoff_used !== undefined && { dropoff_used: dropoff_used }),
        ...(logged_by    !== undefined && { logged_by:    logged_by    }),
      };

      const { data, error } = await supabase
        .from("daycare_sessions")
        .update(updateObj as unknown as Database["public"]["Tables"]["daycare_sessions"]["Update"])
        .eq("id", sessionId)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as SessionRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
    },
  });
}

/** Change `session_date` without affecting package `days_used` (reschedule / correction). */
export function useRescheduleDaycareSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      petId,
      session_date,
    }: {
      sessionId: string;
      petId: string;
      session_date: string;
    }) => {
      const { data: conflict, error: conflictErr } = await supabase
        .from("daycare_sessions")
        .select("id")
        .eq("pet_id", petId)
        .eq("session_date", session_date)
        .neq("id", sessionId)
        .limit(1);

      if (conflictErr) throw conflictErr;
      if ((conflict?.length ?? 0) > 0) {
        throw new Error("This pet already has a session on the selected date.");
      }

      const { data, error } = await supabase
        .from("daycare_sessions")
        .update({ session_date })
        .eq("id", sessionId)
        .select()
        .single();

      if (error) throw error;
      return data as DaycareSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
    },
  });
}

// ── useSessionsByPackage ──────────────────────────────────────────────────────

/** Extended session type that includes the three columns added post-generation */
export type SessionRow = DaycareSession & {
  pickup_used:  boolean | null;
  dropoff_used: boolean | null;
  logged_by:    string | null;
};

function trackerIdFromInvoiceNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/tracker=([^ |]+)/);
  return match?.[1] ?? null;
}

/** Sessions linked to a package credit, plus same-tracker rows for the pet (legacy orphans). */
export function useSessionsByPackage(packageId: string, petId?: string) {
  return useQuery({
    queryKey: ["daycare_sessions", "package", packageId, petId ?? ""] as const,
    enabled: !!packageId,
    queryFn: async () => {
      const { data: byPackage, error: packageErr } = await supabase
        .from("daycare_sessions")
        .select("*")
        .eq("package_id", packageId)
        .order("session_date", { ascending: true });

      if (packageErr) throw packageErr;

      const merged = new Map<string, SessionRow>();
      for (const row of byPackage ?? []) {
        merged.set(row.id, row as unknown as SessionRow);
      }

      if (!petId) {
        return Array.from(merged.values());
      }

      const { data: creditRow, error: creditErr } = await supabase
        .from("service_credits")
        .select("purchase_group_id")
        .eq("id", packageId)
        .maybeSingle();

      if (creditErr) throw creditErr;
      if (!creditRow?.purchase_group_id) {
        return Array.from(merged.values());
      }

      const { data: pgRow, error: pgErr } = await supabase
        .from("purchase_groups")
        .select("invoices(notes)")
        .eq("id", creditRow.purchase_group_id)
        .maybeSingle();

      if (pgErr) throw pgErr;

      const invoiceNotes = (
        pgRow as { invoices?: { notes?: string | null } | null } | null
      )?.invoices?.notes;
      const trackerId = trackerIdFromInvoiceNotes(invoiceNotes);

      if (trackerId) {
        const { data: byTracker, error: trackerErr } = await supabase
          .from("daycare_sessions")
          .select("*")
          .eq("pet_id", petId)
          .like("notes", `%tracker=${trackerId}%`)
          .order("session_date", { ascending: true });

        if (trackerErr) throw trackerErr;

        for (const row of byTracker ?? []) {
          const session = row as unknown as SessionRow;
          if (session.package_id !== packageId) {
            merged.set(session.id, session);
          }
        }
      }

      return Array.from(merged.values()).sort((a, b) =>
        a.session_date.localeCompare(b.session_date),
      );
    },
  });
}

// ── useAllDaycarePackages ─────────────────────────────────────────────────────

export type PackageWithDetails = DaycarePackage & {
  pets:   { name: string } | null;
  owners: {
    first_name: string;
    last_name: string | null;
    is_elite: boolean | null;
    is_vip: boolean;
    member_tier: OwnerMemberTier;
  } | null;
};

export function useAllDaycarePackages() {
  return useQuery({
    queryKey: ["service_credits", "daycare", "all_with_details"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_credits")
        .select(
          "*, pets!inner(name, owner_id, owners(first_name, last_name, is_elite, is_vip)), purchase_groups(staff_label, package_definitions(display_name))",
        )
        // Daycare UI only — base credits (no bonus-choice rows).
        .in("service_code", DAYCARE_CREDIT_CODES)
        .eq("is_bonus", false)
        .neq("status", "revoked")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const mapped = (data ?? []).map((row) => {
        type PetJoin = {
          name: string;
          owner_id: string;
          owners: {
            first_name: string;
            last_name: string | null;
            is_elite: boolean | null;
            is_vip: boolean;
          } | null;
        };
        const pet = (row as unknown as { pets: PetJoin | null }).pets;
        const ownerId = pet?.owner_id ?? "";
        const ownerJoin = pet?.owners;
        const pkgName = creditPackageDisplayName(
          (row as unknown as { purchase_groups?: PurchaseGroupJoin }).purchase_groups ?? null,
        );
        return {
          id: row.id,
          owner_id: ownerId,
          pet_id: row.pet_id,
          total_days: row.units_total,
          days_used: row.units_consumed,
          expiry_date: row.expires_at,
          purchase_date: row.created_at,
          package_name: pkgName ?? null,
          service_code: row.service_code,
          is_bonus: row.is_bonus,
          status: row.status,
          units_remaining: row.units_total - row.units_consumed,
          source_ref_id: row.source_ref_id,
          redemption_group_id: row.redemption_group_id,
          pets: { name: pet?.name ?? "Pet" },
          owners: ownerJoin
            ? {
                first_name: ownerJoin.first_name,
                last_name: ownerJoin.last_name,
                is_elite: ownerJoin.is_elite,
                is_vip: ownerJoin.is_vip,
                member_tier: ownerMemberTierFromFlags(ownerJoin),
              }
            : null,
        };
      });
      return mapped as unknown as PackageWithDetails[];
    },
  });
}

// ── useCreateDaycarePackage ───────────────────────────────────────────────────

type DaycarePackageInsert = {
  owner_id: string;
  package_code?: string;
  pet_ids?: string[];
  payment_method?: Database["public"]["Enums"]["payment_method"];
} & Record<string, unknown>;

export function useCreateDaycarePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pkg: DaycarePackageInsert) => {
      if (!pkg.package_code || !Array.isArray(pkg.pet_ids) || pkg.pet_ids.length === 0) {
        throw new Error("Package sale requires package code and selected pet(s).");
      }
      const { data, error } = await supabase.rpc("purchase_package", {
        p_owner_id: pkg.owner_id,
        p_package_code: pkg.package_code,
        p_pet_ids: pkg.pet_ids,
        p_payment_method: pkg.payment_method ?? "card",
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
    },
  });
}

// ── useUpdateDaycarePackage ───────────────────────────────────────────────────

type DaycarePackageUpdate = Record<string, never>;

export function useUpdateDaycarePackage() {
  return useMutation({
    mutationFn: async (_payload: DaycarePackageUpdate & { id: string }) => {
      throw new Error("Package updates are no longer supported. Please purchase a new package.");
    },
  });
}

// ── useDeleteDaycarePackage ──────────────────────────────────────────────────

export type RevokeDaycarePackageInput = {
  creditId: string;
  reason?: string;
};

export function useDeleteDaycarePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ creditId, reason }: RevokeDaycarePackageInput) => {
      const { data, error } = await supabase.rpc("revoke_daycare_package_credit", {
        p_credit_id: creditId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      const row = (data as { credit_id: string; invoice_voided: boolean }[] | null)?.[0];
      return row ?? { credit_id: creditId, invoice_voided: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
    },
  });
}

export type IssueCustomDaycarePackageInput = {
  owner_id: string;
  pet_ids: string[];
  units: number;
  amount_aed: number;
  label: string;
  validity_months?: number;
  payment_method?: Database["public"]["Enums"]["payment_method"];
  service_code?: Extract<ServiceCode, "daycare_full_day" | "daycare_hourly">;
};

export function useIssueCustomDaycarePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: IssueCustomDaycarePackageInput) => {
      const { data, error } = await supabase.rpc("issue_custom_daycare_package", {
        p_owner_id: input.owner_id,
        p_pet_ids: input.pet_ids,
        p_units: input.units,
        p_amount_aed: input.amount_aed,
        p_label: input.label.trim(),
        p_validity_months: input.validity_months ?? 6,
        p_payment_method: input.payment_method ?? "card",
        p_service_code: input.service_code ?? "daycare_full_day",
      });
      if (error) throw error;
      return (data as {
        invoice_id: string;
        purchase_group_id: string;
        total_amount_aed: number;
        discount_applied_aed: number;
        credits_granted: number;
      }[] | null)?.[0] ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// ── useDeleteDaycareSession ───────────────────────────────────────────────────

export type DeleteSessionPayload = {
  sessionId:  string;
  package_id?: string | null;
};

/**
 * Deletes a daycare session by id.
 */
export function useDeleteDaycareSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }: DeleteSessionPayload) => {
      await cancelDaycareCheckIn(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useCancelDaycareCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      await cancelDaycareCheckIn(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["service_credits"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export type PendingHourlyDaycareSession = {
  id: string;
  session_date: string;
  pet_name: string;
  /** Draft invoice id if one was created at check-in (hours not yet entered). */
  draft_invoice_id: string | null;
};

/** Checked-in hourly daycare sessions for an owner that still need an invoice. */
export function usePendingHourlyDaycareForOwner(ownerId: string) {
  return useQuery({
    queryKey: ["daycare_sessions", "pending_hourly", ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<PendingHourlyDaycareSession[]> => {
      const { data, error } = await supabase
        .from("daycare_sessions")
        .select("id, session_date, notes, package_id, checked_in, pets(name)")
        .eq("owner_id", ownerId)
        .eq("checked_in", true)
        .order("session_date", { ascending: false })
        .limit(100);
      if (error) throw error;

      const sessions = data ?? [];
      const sessionIds = sessions.map((s) => s.id);
      const invoiceIdByServiceId = new Map<string, string>();
      if (sessionIds.length > 0) {
        const { data: invoices, error: invErr } = await supabase
          .from("invoices")
          .select("id, service_id")
          .in("service_id", sessionIds)
          .neq("status", "voided");
        if (invErr) throw invErr;
        for (const inv of invoices ?? []) {
          if (inv.service_id) invoiceIdByServiceId.set(inv.service_id, inv.id);
        }
      }

      return sessions
        .filter((session) =>
          isDaycareHourlyPending(
            {
              sessionId: session.id,
              notes: session.notes,
              packageId: session.package_id,
              checkedIn: Boolean(session.checked_in),
            },
            invoiceIdByServiceId,
          ),
        )
        .map((session) => {
          // Resolve draft invoice id: primary session via service_id map, sibling via HOURLY_DRAFT marker.
          const draftFromServiceId = invoiceIdByServiceId.get(session.id) ?? null;
          const draftFromNotes = isHourlyBillingDraft(session.notes)
            ? parseHourlyDraftId(session.notes)
            : null;
          return {
            id: session.id,
            session_date: session.session_date,
            pet_name: (session as { pets: { name: string } | null }).pets?.name ?? "Pet",
            draft_invoice_id: draftFromServiceId ?? draftFromNotes,
          };
        });
    },
  });
}

export type LinkedDaycareSessionForInvoice = {
  id: string;
  session_date: string;
  pet_name: string;
};

/** Daycare sessions linked to an invoice (primary service_id or hourly family marker in notes). */
export function useLinkedDaycareSessionsForInvoice(
  invoiceId: string | undefined,
  primarySessionId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["daycare_sessions", "linked_invoice", invoiceId, primarySessionId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<LinkedDaycareSessionForInvoice[]> => {
      const marker = `HOURLY_INVOICED:${invoiceId}`;
      const filters: string[] = [`notes.ilike.%${marker}%`];
      if (primarySessionId) filters.push(`id.eq.${primarySessionId}`);

      const { data, error } = await supabase
        .from("daycare_sessions")
        .select("id, session_date, pets(name)")
        .or(filters.join(","))
        .order("session_date", { ascending: true });
      if (error) throw error;

      const seen = new Set<string>();
      const rows: LinkedDaycareSessionForInvoice[] = [];
      for (const row of data ?? []) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push({
          id: row.id,
          session_date: row.session_date,
          pet_name: (row as { pets: { name: string } | null }).pets?.name ?? "Pet",
        });
      }
      return rows;
    },
  });
}
