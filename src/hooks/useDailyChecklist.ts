import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { allShiftStaffSigned, SHIFT_SIGNOFF_STAFF } from "@/config/dailyChecklist";
import { supabase } from "@/integrations/supabase/client";

export type ItemState = { checked?: boolean; note?: string };

export type SignOffEntry = { signed_at: string; staff_id: string | null };

export type SignOffs = Record<string, SignOffEntry>;

export type ChecklistRow = {
  id: string;
  checklist_date: string;
  status: "in_progress" | "completed";
  items: Record<string, ItemState>;
  sign_offs: SignOffs;
  completed_by: string | null;
  completed_at: string | null;
};

export function useDailyChecklist(date: string, staffId?: string | null) {
  const qc = useQueryClient();
  const queryKey = ["daily_checklist", date] as const;

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ChecklistRow | null> => {
      const { data, error } = await supabase
        .from("daily_checklists")
        .select("*")
        .eq("checklist_date", date)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as ChecklistRow;
      return { ...row, sign_offs: (row.sign_offs ?? {}) as SignOffs };
    },
  });

  async function save(patch: Record<string, unknown>) {
    const { data, error } = await supabase
      .from("daily_checklists")
      .upsert({ checklist_date: date, ...patch }, { onConflict: "checklist_date" })
      .select("*")
      .single();
    if (error) throw error;
    const row = data as ChecklistRow;
    const normalized = { ...row, sign_offs: (row.sign_offs ?? {}) as SignOffs };
    qc.setQueryData(queryKey, normalized);
    return normalized;
  }

  function statusPatchForSignOffs(signOffs: SignOffs): Record<string, unknown> {
    if (allShiftStaffSigned(signOffs)) {
      const times = SHIFT_SIGNOFF_STAFF.map((s) => signOffs[s.id]?.signed_at).filter(Boolean) as string[];
      const latest = times.sort().at(-1) ?? new Date().toISOString();
      return { status: "completed", completed_at: latest, completed_by: null };
    }
    return { status: "in_progress", completed_at: null, completed_by: null };
  }

  const setItem = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: ItemState }) => {
      const items = qc.getQueryData<ChecklistRow | null>(queryKey)?.items ?? {};
      return save({ items: { ...items, [itemId]: { ...items[itemId], ...patch } } });
    },
  });

  const signOff = useMutation({
    mutationFn: (slotId: string) => {
      const current = qc.getQueryData<ChecklistRow | null>(queryKey)?.sign_offs ?? {};
      const signOffs: SignOffs = {
        ...current,
        [slotId]: { signed_at: new Date().toISOString(), staff_id: staffId ?? null },
      };
      return save({ sign_offs: signOffs, ...statusPatchForSignOffs(signOffs) });
    },
  });

  const undoSignOff = useMutation({
    mutationFn: (slotId: string) => {
      const current = { ...(qc.getQueryData<ChecklistRow | null>(queryKey)?.sign_offs ?? {}) };
      delete current[slotId];
      return save({ sign_offs: current, ...statusPatchForSignOffs(current) });
    },
  });

  return {
    row: query.data ?? null,
    items: query.data?.items ?? {},
    signOffs: query.data?.sign_offs ?? {},
    query,
    setItem,
    signOff,
    undoSignOff,
  };
}
