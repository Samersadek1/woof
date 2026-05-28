import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { StaffRow } from "@/hooks/useStaff";

export function staffDisplayName(staff: Pick<StaffRow, "first_name" | "last_name">): string {
  return [staff.first_name, staff.last_name].filter(Boolean).join(" ").trim();
}

/** Resolve the logged-in user's staff profile display name (for performed_by defaults). */
export function useCurrentStaffName(): {
  staffName: string;
  staff: StaffRow | null;
  isLoading: boolean;
} {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["my_staff_profile", user?.email ?? ""] as const,
    enabled: !!user?.email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("email", user!.email!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as StaffRow | null;
    },
  });

  const staff = query.data ?? null;
  const staffName = staff ? staffDisplayName(staff) : "";

  return { staffName, staff, isLoading: query.isLoading };
}
