import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import type { DogSizeFormValue } from "@/lib/dogSizeForm";
import type { ManualGroomingAddonAed } from "@/lib/groomingNewAppointmentPricing";
import { fetchNewGroomingAppointmentOriginalAed } from "@/lib/groomingNewAppointmentRates";

export function useNewGroomingAppointmentPrice(args: {
  selectedServices: readonly string[];
  dogSize: DogSizeFormValue | null;
  manualAddons?: ManualGroomingAddonAed | null;
  petCoat?: Database["public"]["Enums"]["coat_type"] | null;
  bookingDate?: string;
  enabled?: boolean;
}) {
  const { selectedServices, dogSize, manualAddons, petCoat, bookingDate, enabled = true } = args;
  return useQuery({
    queryKey: [
      "grooming-new-appt-price",
      selectedServices.join(","),
      dogSize,
      petCoat,
      bookingDate,
      manualAddons?.matting_fee,
      manualAddons?.heavy_dog_fee,
    ],
    enabled: enabled && selectedServices.length > 0,
    queryFn: () =>
      fetchNewGroomingAppointmentOriginalAed(selectedServices, dogSize, manualAddons, {
        petCoat,
        bookingDate,
      }),
  });
}
