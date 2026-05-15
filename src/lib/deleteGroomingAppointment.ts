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

  const { error: eventsErr } = await supabase
    .from("grooming_status_events")
    .delete()
    .eq("appointment_id", appointmentId);
  if (eventsErr) throw eventsErr;

  const { error: apptErr } = await supabase
    .from("grooming_appointments")
    .delete()
    .eq("id", appointmentId);
  if (apptErr) throw apptErr;
}
