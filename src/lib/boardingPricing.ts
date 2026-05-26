import { supabase } from "@/integrations/supabase/client";
import {
  boardingRateSeasonLabel,
  boardingStaySeasonSummary,
  eachBoardingNight,
  type BoardingRateSeason,
} from "@/lib/boardingSeason";

async function isPeakBoardingDate(date: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_peak_date", { p_date: date });
  if (error) throw error;
  return Boolean(data);
}

export type BoardingRate = {
  unitPrice: number;
  pricingKey: string;
  season: BoardingRateSeason;
  isPeak: boolean;
};

type ResolveBoardingRateOptions = {
  checkInDate?: string | null;
  checkOutDate?: string | null;
  /** @deprecated Season is resolved from `checkInDate` via `is_peak_date`. */
  rateType?: BoardingRateSeason;
};

export type BoardingNightRate = BoardingRate & {
  date: string;
};

export type BoardingStayRates = {
  nights: BoardingNightRate[];
  totalAed: number;
  peakNights: number;
  offPeakNights: number;
  seasonSummary: string;
};

async function resolveBoardingRateForDate(
  bookingDate: string,
): Promise<BoardingRate> {
  const [rateResult, isPeak] = await Promise.all([
    supabase.rpc("resolve_woof_service_rate", {
      p_service_code: "boarding_night",
      p_pet_size: null,
      p_coat_type: null,
      p_booking_date: bookingDate,
    }),
    isPeakBoardingDate(bookingDate),
  ]);

  if (rateResult.error) throw rateResult.error;

  const row = (rateResult.data ?? [])[0];
  const season: BoardingRateSeason = isPeak ? "peak" : "off_peak";
  if (row && typeof row.amount_aed === "number") {
    return {
      unitPrice: row.amount_aed,
      pricingKey: "boarding_night",
      season,
      isPeak,
    };
  }
  return {
    unitPrice: 0,
    pricingKey: "boarding_night",
    season,
    isPeak,
  };
}

export async function resolveBoardingRate(
  _roomId: string,
  _petCount: number,
  opts?: ResolveBoardingRateOptions,
): Promise<BoardingRate> {
  void _roomId;
  void _petCount;
  void opts?.rateType;
  void opts?.checkOutDate;
  const bookingDate = opts?.checkInDate ?? formatToday();
  return resolveBoardingRateForDate(bookingDate);
}

export async function resolveBoardingStayRates(
  _roomId: string,
  petCount: number,
  checkIn: string,
  checkOut: string,
): Promise<BoardingStayRates> {
  void _roomId;
  const billedPetCount = Math.max(1, petCount);
  const dates = eachBoardingNight(checkIn, checkOut);
  const nights = await Promise.all(
    dates.map(async (date) => ({
      date,
      ...(await resolveBoardingRateForDate(date)),
    })),
  );
  const peakNights = nights.filter((n) => n.isPeak).length;
  const offPeakNights = nights.length - peakNights;
  const perPetTotalAed = nights.reduce((sum, n) => sum + n.unitPrice, 0);
  const totalAed = perPetTotalAed * billedPetCount;
  return {
    nights,
    totalAed,
    peakNights,
    offPeakNights,
    seasonSummary: boardingStaySeasonSummary(peakNights, offPeakNights),
  };
}

function formatToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export { boardingRateSeasonLabel, boardingStaySeasonSummary };
