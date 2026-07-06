import { getSupabase } from "@/lib/supabaseRuntime";
import {
  boardingRateSeasonLabel,
  boardingStaySeasonSummary,
  eachBoardingNight,
  type BoardingRateSeason,
} from "@/lib/boardingSeason";

export type BoardingType = "boarding_only" | "board_and_train";

/** Default Board & Train nightly rate when the rate card row is missing or unparsable. */
export const BOARD_AND_TRAIN_NIGHT_AED = 170;

function parseServiceRateAed(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

async function isPeakBoardingDate(date: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("is_peak_date", { p_date: date });
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
  boardingType?: BoardingType;
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
  boardingType: BoardingType = "boarding_only",
): Promise<BoardingRate> {
  if (boardingType === "board_and_train") {
    let unitPrice = BOARD_AND_TRAIN_NIGHT_AED;
    try {
      const rateResult = await getSupabase().rpc("resolve_woof_service_rate", {
        p_service_code: "board_and_train_night",
        p_pet_size: null,
        p_coat_type: null,
        p_booking_date: bookingDate,
      });
      if (rateResult.error) throw rateResult.error;
      const resolved = parseServiceRateAed((rateResult.data ?? [])[0]?.amount_aed);
      if (resolved > 0) unitPrice = resolved;
    } catch {
      // Rate card row or service_code enum may not be migrated yet — use business default.
    }
    return {
      unitPrice,
      pricingKey: "board_and_train_night",
      season: "off_peak",
      isPeak: false,
    };
  }

  const [rateResult, isPeak] = await Promise.all([
    getSupabase().rpc("resolve_woof_service_rate", {
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
  const unitPrice = parseServiceRateAed(row?.amount_aed);
  if (unitPrice > 0) {
    return {
      unitPrice,
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
  return resolveBoardingRateForDate(bookingDate, opts?.boardingType);
}

export async function resolveBoardingStayRates(
  _roomId: string,
  petCount: number,
  checkIn: string,
  checkOut: string,
  boardingType: BoardingType = "boarding_only",
): Promise<BoardingStayRates> {
  void _roomId;
  const billedPetCount = Math.max(1, petCount);
  const dates = eachBoardingNight(checkIn, checkOut);
  const nights = await Promise.all(
    dates.map(async (date) => ({
      date,
      ...(await resolveBoardingRateForDate(date, boardingType)),
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
    seasonSummary:
      boardingType === "board_and_train"
        ? "Board & Train — flat rate"
        : boardingStaySeasonSummary(peakNights, offPeakNights),
  };
}

function formatToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export { boardingRateSeasonLabel, boardingStaySeasonSummary };
