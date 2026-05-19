import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const vetClinicsQueryKey = ["vet_clinics"] as const;

export type VetClinicRow = {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

export type VetClinicInput = {
  name: string;
  phone?: string | null;
  is_active?: boolean;
};

async function fetchVetClinics(activeOnly: boolean): Promise<VetClinicRow[]> {
  let q = supabase
    .from("vet_clinics")
    .select("id,name,phone,is_active,created_at")
    .order("name", { ascending: true });
  if (activeOnly) {
    q = q.eq("is_active", true);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as VetClinicRow[];
}

export function useVetClinicsQuery(options?: { activeOnly?: boolean }) {
  const activeOnly = options?.activeOnly ?? false;
  return useQuery({
    queryKey: [...vetClinicsQueryKey, activeOnly ? "active" : "all"],
    queryFn: () => fetchVetClinics(activeOnly),
  });
}

export function useCreateVetClinic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VetClinicInput) => {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("Name is required");
      const phone = input.phone?.trim() || null;
      const { error } = await supabase.from("vet_clinics").insert({
        name: trimmed,
        phone,
        is_active: input.is_active ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: vetClinicsQueryKey });
    },
  });
}

export function useUpdateVetClinic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: VetClinicInput & { id: string }) => {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("Name is required");
      const phone = input.phone?.trim() || null;
      const { error } = await supabase
        .from("vet_clinics")
        .update({
          name: trimmed,
          phone,
          is_active: input.is_active ?? true,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: vetClinicsQueryKey });
    },
  });
}

export function useDeleteVetClinic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vet_clinics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: vetClinicsQueryKey });
    },
  });
}
