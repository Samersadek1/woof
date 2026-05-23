import { supabase } from "@/integrations/supabase/client";

type BoardingRate = {
  unitPrice: number;
  pricingKey: string;
};

type ResolveBoardingRateOptions = {
  checkInDate?: string | null;
  checkOutDate?: string | null;
  rateType?: "peak" | "off_peak";
};

export async function resolveBoardingRate(
  roomId: string,
  petCount: number,
  opts?: ResolveBoardingRateOptions,
): Promise<BoardingRate> {
  void roomId;
  void petCount;
  const bookingDate = opts?.checkInDate ?? null;
  const { data, error } = await supabase.rpc("resolve_woof_service_rate", {
    p_service_code: "boarding_night",
    p_pet_size: null,
    p_coat_type: null,
    p_booking_date: bookingDate,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (row && typeof row.amount_aed === "number") {
    return { unitPrice: row.amount_aed, pricingKey: "boarding_night" };
  }
  return {
    unitPrice: 0,
    pricingKey: "boarding_night",
  };
}

