import { supabase } from "@/integrations/supabase/client";

export interface DeleteGroomingAppointmentWithLogInput {
  appointmentId: string;
  appointmentDate: string;
  petName: string;
  ownerName: string;
  service: string;
  price: number | null;
  reason: string;
  deletedByEmail: string;
}

export async function deleteGroomingAppointmentWithLog(
  input: DeleteGroomingAppointmentWithLogInput,
): Promise<void> {
  const {
    appointmentId,
    appointmentDate,
    petName,
    ownerName,
    service,
    price,
    reason,
    deletedByEmail,
  } = input;

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("A deletion reason is required.");
  }

  const { error: eventsErr } = await supabase
    .from("grooming_status_events")
    .delete()
    .eq("appointment_id", appointmentId);
  if (eventsErr) throw eventsErr;

  const { data: remainingEvents, error: checkErr } = await supabase
    .from("grooming_status_events")
    .select("id")
    .eq("appointment_id", appointmentId)
    .limit(1);
  if (checkErr) throw checkErr;
  if (remainingEvents && remainingEvents.length > 0) {
    throw new Error(
      "Could not remove status history for this appointment. Apply the grooming_status_events delete policy migration.",
    );
  }

  const { error: apptErr } = await supabase
    .from("grooming_appointments")
    .delete()
    .eq("id", appointmentId);
  if (apptErr) throw apptErr;

  const { error: logErr } = await supabase.from("grooming_appointment_deletion_log").insert({
    appointment_id: appointmentId,
    appointment_date: appointmentDate,
    pet_name: petName,
    owner_name: ownerName,
    service,
    price,
    deleted_by: deletedByEmail,
    reason: trimmedReason,
  });
  if (logErr) throw logErr;
}
