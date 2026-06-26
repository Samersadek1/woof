import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import type { DogSizeFormValue } from "@/lib/dogSizeForm";
import type { ManualGroomingAddonAed } from "@/lib/groomingNewAppointmentPricing";
import {
  fetchNewGroomingAppointmentOriginalAed,
  fetchNewGroomingAppointmentPriceBreakdown,
} from "@/lib/groomingNewAppointmentRates";

type GroomingPriceArgs = {
  selectedServices: readonly string[];
  dogSize: DogSizeFormValue | null;
  manualAddons?: ManualGroomingAddonAed | null;
  petCoat?: Database["public"]["Enums"]["coat_type"] | null;
  bookingDate?: string;
  enabled?: boolean;
};

export function useNewGroomingAppointmentPrice(args: GroomingPriceArgs) {
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

/** Same inputs as useNewGroomingAppointmentPrice, but returns the base/add-ons split. */
export function useNewGroomingAppointmentPriceBreakdown(args: GroomingPriceArgs) {
  const { selectedServices, dogSize, manualAddons, petCoat, bookingDate, enabled = true } = args;
  return useQuery({
    queryKey: [
      "grooming-new-appt-price-breakdown",
      selectedServices.join(","),
      dogSize,
      petCoat,
      bookingDate,
      manualAddons?.matting_fee,
      manualAddons?.heavy_dog_fee,
    ],
    enabled: enabled && selectedServices.length > 0,
    queryFn: () =>
      fetchNewGroomingAppointmentPriceBreakdown(selectedServices, dogSize, manualAddons, {
        petCoat,
        bookingDate,
      }),
  });
}
