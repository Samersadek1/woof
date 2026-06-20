import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PetGroomingNoteRow = Database["public"]["Tables"]["pet_grooming_notes"]["Row"] & {
  grooming_appointments: { service: Database["public"]["Enums"]["grooming_service"] } | null;
};

export const petGroomingNotesKeys = {
  byPet: (petId: string) => ["pet-grooming-notes", petId] as const,
  byAppointment: (appointmentId: string) => ["pet-grooming-notes", "appt", appointmentId] as const,
};

export function usePetGroomingNotesLog(petId: string, enabled = true) {
  return useQuery({
    queryKey: petGroomingNotesKeys.byPet(petId),
    enabled: enabled && !!petId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pet_grooming_notes")
        .select("*, grooming_appointments(service)")
        .eq("pet_id", petId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as PetGroomingNoteRow[];
    },
  });
}

export function usePetGroomingNoteForAppointment(appointmentId: string | null) {
  return useQuery({
    queryKey: petGroomingNotesKeys.byAppointment(appointmentId ?? ""),
    enabled: !!appointmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pet_grooming_notes")
        .select("*")
        .eq("appointment_id", appointmentId!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertPetGroomingNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      petId: string;
      appointmentId: string;
      note: string;
      writtenBy: string;
    }) => {
      const trimmed = input.note.trim();
      if (!trimmed) throw new Error("Note cannot be empty.");

      const { data: existing, error: findErr } = await supabase
        .from("pet_grooming_notes")
        .select("id")
        .eq("appointment_id", input.appointmentId)
        .maybeSingle();

      if (findErr) throw findErr;

      if (existing?.id) {
        const { error } = await supabase
          .from("pet_grooming_notes")
          .update({ note: trimmed, written_by: input.writtenBy })
          .eq("id", existing.id);
        if (error) throw error;
        return existing.id;
      }

      const { data, error } = await supabase
        .from("pet_grooming_notes")
        .insert({
          pet_id: input.petId,
          appointment_id: input.appointmentId,
          note: trimmed,
          written_by: input.writtenBy,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: petGroomingNotesKeys.byPet(vars.petId) });
      qc.invalidateQueries({
        queryKey: petGroomingNotesKeys.byAppointment(vars.appointmentId),
      });
    },
  });
}
