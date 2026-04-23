import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type AssessmentStatus = "not_assessed" | "scheduled" | "passed" | "failed";

export function useUpdateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      pet_id: string;
      status: AssessmentStatus;
      date?: string;
      notes?: string;
      assessed_by?: string;
    }) => {
      const { error } = await supabase
        .from("pets")
        .update({
          assessment_status: args.status,
          assessment_date: args.date ?? new Date().toISOString().slice(0, 10),
          assessment_notes: args.notes,
          assessed_by: args.assessed_by,
        })
        .eq("id", args.pet_id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pets", "detail", vars.pet_id] });
      qc.invalidateQueries({ queryKey: ["pets"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
