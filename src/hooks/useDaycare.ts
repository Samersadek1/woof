import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DaycarePackage = Database["public"]["Tables"]["daycare_packages"]["Row"];
type DaycareSession = Database["public"]["Tables"]["daycare_sessions"]["Row"];
type DaycareSessionInsert = Database["public"]["Tables"]["daycare_sessions"]["Insert"];

export type { DaycarePackage, DaycareSession };

// ── Query keys ────────────────────────────────────────────────────────────────

export const daycareQueryKeys = {
  packages:         (ownerId?: string) => ["daycare_packages", ownerId ?? "all"] as const,
  packagesByPet:    (petId: string)    => ["daycare_packages", "pet", petId]     as const,
  sessions:         (date?: string)    => ["daycare_sessions",  date  ?? "all"]   as const,
  sessionsByPet:    (petId: string)    => ["daycare_sessions",  "pet", petId]     as const,
  sessionsByOwner:  (ownerId: string)  => ["daycare_sessions",  "owner", ownerId] as const,
};

// ── Enriched types ────────────────────────────────────────────────────────────

export type DaycareSessionWithDetails = DaycareSession & {
  pets:            { name: string; species: string } | null;
  owners:          { first_name: string; last_name: string } | null;
  daycare_packages:{ total_days: number; days_used: number } | null;
};

// ── Shared attendance payload ─────────────────────────────────────────────────
//
//   remark        → notes  (DB column name)
//   pickup_used   → pickup_used  (BOOLEAN — column added to daycare_sessions)
//   dropoff_used  → dropoff_used (BOOLEAN — column added to daycare_sessions)
//   logged_by     → logged_by   (TEXT    — column added to daycare_sessions)
//
// NOTE: The local types.ts was generated before these three columns were added.
// Insert/update objects are cast via `as unknown as DaycareSessionInsert` until
// types are regenerated from Supabase, at which point the cast can be removed.

export type AttendancePayload = {
  pickup_used?:  boolean;
  dropoff_used?: boolean;
  /** Free-text name of the staff member who logged the session */
  logged_by?:    string | null;
  /** Saved to `notes` column */
  remark?:       string | null;
};

// ── Internal helper: increment days_used on a package by delta ────────────────

async function adjustPackageDaysUsed(packageId: string, delta: 1 | -1): Promise<void> {
  const { data: pkg, error: fetchErr } = await supabase
    .from("daycare_packages")
    .select("days_used")
    .eq("id", packageId)
    .single();

  if (fetchErr) throw fetchErr;

  const newCount = Math.max(0, (pkg.days_used ?? 0) + delta);

  const { error: updateErr } = await supabase
    .from("daycare_packages")
    .update({ days_used: newCount })
    .eq("id", packageId);

  if (updateErr) throw updateErr;
}

// ── Base read hooks ───────────────────────────────────────────────────────────

/** All active packages for an owner, with remaining days computed */
export function useDaycarePackages(ownerId: string) {
  return useQuery({
    queryKey: daycareQueryKeys.packages(ownerId),
    enabled:  !!ownerId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from("daycare_packages")
        .select("*")
        .eq("owner_id", ownerId)
        .order("purchase_date", { ascending: false });

      if (error) throw error;
      return data as DaycarePackage[];
    },
  });
}

/** All sessions for a given calendar date, joined with pet + owner details */
export function useDaycareSessionsByDate(date: string) {
  return useQuery({
    queryKey: daycareQueryKeys.sessions(date),
    enabled:  !!date,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from("daycare_sessions")
        .select("*, pets(name, species), owners(first_name, last_name), daycare_packages(total_days, days_used)")
        .eq("session_date", date)
        .order("checked_in_at", { ascending: true });

      if (error) throw error;
      return data as DaycareSessionWithDetails[];
    },
  });
}

/** All sessions for a pet, most recent first */
export function useDaycareSessionsByPet(petId: string) {
  return useQuery({
    queryKey: daycareQueryKeys.sessionsByPet(petId),
    enabled:  !!petId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from("daycare_sessions")
        .select("*, daycare_packages(total_days, days_used)")
        .eq("pet_id", petId)
        .order("session_date", { ascending: false });

      if (error) throw error;
      return data as DaycareSession[];
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

      // Increment package days used (use the supplied package_id or the
      // one stored on the session row we just updated)
      const pkgId = package_id ?? session.package_id;
      if (pkgId) await adjustPackageDaysUsed(pkgId, 1);

      return session as DaycareSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"]  });
      queryClient.invalidateQueries({ queryKey: ["daycare_packages"]  });
    },
  });
}

// ── useAddDaycareDay ──────────────────────────────────────────────────────────

export type AddDaycareDayPayload = AttendancePayload & {
  session_date: string;
  pet_id:       string;
  owner_id:     string;
  package_id?:  string | null;
};

/**
 * Inserts a new daycare_session row already marked as attended (checked_in=true),
 * then increments days_used on the linked package by 1.
 *
 * Useful for logging a drop-in day or back-filling missed check-ins.
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

      // cast until types.ts is regenerated to include the new columns
      const insert = {
        session_date,
        pet_id,
        owner_id,
        package_id:    package_id  ?? null,
        checked_in:    true,
        checked_in_at: new Date().toISOString(),
        notes:         remark      ?? null,
        pickup_used:   pickup_used  ?? false,
        dropoff_used:  dropoff_used ?? false,
        logged_by:     logged_by    ?? null,
      } as unknown as DaycareSessionInsert;

      const { data: session, error } = await supabase
        .from("daycare_sessions")
        .insert(insert)
        .select()
        .single();

      if (error) throw error;

      if (package_id) await adjustPackageDaysUsed(package_id, 1);

      return session as DaycareSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"]  });
      queryClient.invalidateQueries({ queryKey: ["daycare_packages"]  });
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

// ── useSessionsByPackage ──────────────────────────────────────────────────────

/** Extended session type that includes the three columns added post-generation */
export type SessionRow = DaycareSession & {
  pickup_used:  boolean | null;
  dropoff_used: boolean | null;
  logged_by:    string | null;
};

export function useSessionsByPackage(packageId: string) {
  return useQuery({
    queryKey: ["daycare_sessions", "package", packageId] as const,
    enabled:  !!packageId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from("daycare_sessions")
        .select("*")
        .eq("package_id", packageId)
        .order("session_date", { ascending: true });

      if (error) throw error;
      return data as unknown as SessionRow[];
    },
  });
}

// ── useAllDaycarePackages ─────────────────────────────────────────────────────

export type PackageWithDetails = DaycarePackage & {
  pets:   { name: string } | null;
  owners: { first_name: string; last_name: string; member_type: string } | null;
};

export function useAllDaycarePackages() {
  return useQuery({
    queryKey: ["daycare_packages", "all_with_details"] as const,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from("daycare_packages")
        .select("*, pets(name), owners(first_name, last_name, member_type)")
        .order("purchase_date", { ascending: false });

      if (error) throw error;
      return data as unknown as PackageWithDetails[];
    },
  });
}

// ── useCreateDaycarePackage ───────────────────────────────────────────────────

type DaycarePackageInsert = Database["public"]["Tables"]["daycare_packages"]["Insert"];

export function useCreateDaycarePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pkg: DaycarePackageInsert) => {
      const { data, error } = await supabase
        .from("daycare_packages")
        .insert(pkg)
        .select()
        .single();

      if (error) throw error;
      return data as DaycarePackage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_packages"] });
    },
  });
}

// ── useDeleteDaycareSession ───────────────────────────────────────────────────

export type DeleteSessionPayload = {
  sessionId:  string;
  package_id?: string | null;
};

/**
 * Deletes a daycare session by id, then decrements days_used on the linked
 * package by 1 (floor 0). Useful for correcting accidental check-ins.
 */
export function useDeleteDaycareSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, package_id }: DeleteSessionPayload) => {
      // Fetch the session first so we have package_id if not supplied
      const { data: session, error: fetchErr } = await supabase
        .from("daycare_sessions")
        .select("id, package_id")
        .eq("id", sessionId)
        .single();

      if (fetchErr) throw fetchErr;

      const { error: deleteErr } = await supabase
        .from("daycare_sessions")
        .delete()
        .eq("id", sessionId);

      if (deleteErr) throw deleteErr;

      const pkgId = package_id ?? session.package_id;
      if (pkgId) await adjustPackageDaysUsed(pkgId, -1);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daycare_sessions"]  });
      queryClient.invalidateQueries({ queryKey: ["daycare_packages"]  });
    },
  });
}
