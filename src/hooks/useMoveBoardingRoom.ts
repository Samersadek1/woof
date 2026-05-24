import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export type MoveBoardingRoomInput = {
  bookingId: string;
  effectiveDate: string;
  targetRoomId: string;
  reason?: string;
  movedBy?: string;
  overrideDoNotMove?: boolean;
};

export function useMoveBoardingRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MoveBoardingRoomInput) => {
      const { data, error } = await supabase.rpc("move_boarding_room", {
        p_booking_id: input.bookingId,
        p_effective_date: input.effectiveDate,
        p_target_room_id: input.targetRoomId,
        p_reason: input.reason?.trim() || null,
        p_moved_by: input.movedBy?.trim() || null,
        p_override_do_not_move: input.overrideDoNotMove ?? false,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking_room_assignments"] });
    },
  });
}
