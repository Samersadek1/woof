import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export function lastNight(checkOutExclusive: string): string {
  return format(addDays(parseISO(checkOutExclusive), -1), "yyyy-MM-dd");
}

type AssignmentRow = {
  id: string;
  booking_id: string;
  room_id: string;
  start_date: string;
  end_date: string;
};

export type SegmentSyncAction =
  | { type: "delete"; id: string }
  | { type: "update"; id: string; start_date?: string; end_date?: string };

export type SyncRoomAssignmentsResult = {
  trimmed: number;
  extended: boolean;
  warning?: string;
};

/** Pure plan: how to align assignment segments with stay dates (for tests and apply). */
export function planBoardingRoomAssignmentSync(
  assignments: Pick<AssignmentRow, "id" | "start_date" | "end_date">[],
  checkIn: string,
  checkOutExclusive: string,
): { actions: SegmentSyncAction[]; extendLastSegmentTo: string | null } {
  const last = lastNight(checkOutExclusive);
  const actions: SegmentSyncAction[] = [];

  for (const seg of assignments) {
    if (seg.end_date < checkIn || seg.start_date > last) {
      actions.push({ type: "delete", id: seg.id });
      continue;
    }
    if (seg.end_date > last) {
      actions.push({ type: "update", id: seg.id, end_date: last });
      continue;
    }
    if (seg.start_date < checkIn) {
      actions.push({ type: "update", id: seg.id, start_date: checkIn });
    }
  }

  const afterIds = new Set(assignments.map((s) => s.id));
  for (const a of actions) {
    if (a.type === "delete") afterIds.delete(a.id);
  }

  const simulated = assignments
    .filter((s) => afterIds.has(s.id))
    .map((s) => {
      const upd = actions.filter((a) => a.type === "update" && a.id === s.id);
      let start = s.start_date;
      let end = s.end_date;
      for (const u of upd) {
        if (u.type === "update") {
          if (u.start_date) start = u.start_date;
          if (u.end_date) end = u.end_date;
        }
      }
      return { ...s, start_date: start, end_date: end };
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const lastSeg = simulated[simulated.length - 1];
  const extendLastSegmentTo =
    lastSeg && lastSeg.end_date < last ? last : null;

  return { actions, extendLastSegmentTo };
}

/** Trim or extend room assignment segments after a boarding stay date change. */
export async function syncBoardingRoomAssignmentsAfterDateChange(
  bookingId: string,
  checkIn: string,
  checkOutExclusive: string,
): Promise<SyncRoomAssignmentsResult> {
  const { data: rows, error } = await supabase
    .from("booking_room_assignments")
    .select("id, booking_id, room_id, start_date, end_date")
    .eq("booking_id", bookingId)
    .order("start_date", { ascending: true });

  if (error) throw error;
  const assignments = (rows ?? []) as AssignmentRow[];
  if (assignments.length === 0) {
    return {
      trimmed: 0,
      extended: false,
      warning: "Stay dates updated — no kennel assignment to adjust.",
    };
  }

  const { actions, extendLastSegmentTo } = planBoardingRoomAssignmentSync(
    assignments,
    checkIn,
    checkOutExclusive,
  );

  let trimmed = 0;
  for (const action of actions) {
    if (action.type === "delete") {
      const { error: delErr } = await supabase
        .from("booking_room_assignments")
        .delete()
        .eq("id", action.id);
      if (delErr) throw delErr;
      trimmed += 1;
    } else {
      const patch: { start_date?: string; end_date?: string } = {};
      if (action.start_date) patch.start_date = action.start_date;
      if (action.end_date) patch.end_date = action.end_date;
      const { error: updErr } = await supabase
        .from("booking_room_assignments")
        .update(patch)
        .eq("id", action.id);
      if (updErr) throw updErr;
      trimmed += 1;
    }
  }

  const { data: refreshed, error: refreshErr } = await supabase
    .from("booking_room_assignments")
    .select("id, booking_id, room_id, start_date, end_date")
    .eq("booking_id", bookingId)
    .order("start_date", { ascending: true });

  if (refreshErr) throw refreshErr;
  const current = (refreshed ?? []) as AssignmentRow[];

  if (current.length === 0) {
    return {
      trimmed,
      extended: false,
      warning: "Stay shortened — kennel assignment was removed. Use Change room to reassign.",
    };
  }

  let extended = false;
  if (extendLastSegmentTo) {
    const lastSeg = current[current.length - 1];
    const { error: extErr } = await supabase
      .from("booking_room_assignments")
      .update({ end_date: extendLastSegmentTo })
      .eq("id", lastSeg.id);
    if (extErr) throw extErr;
    extended = true;
  }

  return { trimmed, extended };
}
