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

export type SyncRoomAssignmentsResult = {
  trimmed: number;
  extended: boolean;
  warning?: string;
};

/** Trim or extend room assignment segments after a boarding stay date change. */
export async function syncBoardingRoomAssignmentsAfterDateChange(
  bookingId: string,
  checkIn: string,
  checkOutExclusive: string,
): Promise<SyncRoomAssignmentsResult> {
  const last = lastNight(checkOutExclusive);

  const { data: rows, error } = await supabase
    .from("booking_room_assignments")
    .select("id, booking_id, room_id, start_date, end_date")
    .eq("booking_id", bookingId)
    .order("start_date", { ascending: true });

  if (error) throw error;
  const assignments = (rows ?? []) as AssignmentRow[];
  if (assignments.length === 0) {
    return { trimmed: 0, extended: false, warning: "Stay dates updated — no kennel assignment to adjust." };
  }

  let trimmed = 0;
  let extended = false;
  let warning: string | undefined;

  for (const seg of assignments) {
    if (seg.end_date > last) {
      if (seg.start_date > last) {
        await supabase.from("booking_room_assignments").delete().eq("id", seg.id);
        trimmed += 1;
      } else {
        await supabase
          .from("booking_room_assignments")
          .update({ end_date: last })
          .eq("id", seg.id);
        trimmed += 1;
      }
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
    warning = "Stay shortened — kennel assignment was removed. Use Change room to reassign.";
    return { trimmed, extended, warning };
  }

  const lastSeg = current[current.length - 1];
  if (lastSeg.end_date < last) {
    await supabase
      .from("booking_room_assignments")
      .update({ end_date: last })
      .eq("id", lastSeg.id);
    extended = true;
  }

  const clippedStart = current[0].start_date;
  if (clippedStart < checkIn) {
    await supabase
      .from("booking_room_assignments")
      .update({ start_date: checkIn })
      .eq("id", current[0].id);
    trimmed += 1;
  }

  return { trimmed, extended, warning };
}
