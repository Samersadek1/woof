import { differenceInCalendarDays, parseISO } from "date-fns";
import { resolveBoardingStayRates, type BoardingType } from "@/lib/boardingPricing";
import {
  boardingRateSeasonLabel,
  formatBoardingDateRange,
  groupBoardingNightsByContiguousSeason,
} from "@/lib/boardingSeason";

export type BoardingInvoicePet = {
  id: string;
  name: string;
};

export type BoardingInvoiceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  pricingKey?: string;
  serviceType?: string;
  preserveUnitPrice?: boolean;
};

export {
  deriveInvoiceStatusAfterRecalc,
  isBoardingNightLineItem,
} from "@/lib/boardingInvoiceLineUtils";

const DEFAULT_PET: BoardingInvoicePet = { id: "_", name: "Pet" };

function normalizePets(pets: BoardingInvoicePet[] | undefined, petCount: number): BoardingInvoicePet[] {
  if (pets && pets.length > 0) return pets;
  const count = Math.max(1, petCount);
  return Array.from({ length: count }, (_, i) => ({
    id: `_pet_${i}`,
    name: count === 1 ? DEFAULT_PET.name : `Pet ${i + 1}`,
  }));
}

function boardingNightDescription(args: {
  petName: string;
  boardingLabel: string;
  season: "peak" | "off_peak";
  startDate: string;
  endDate: string;
  nightCount: number;
}): string {
  const { petName, boardingLabel, season, startDate, endDate, nightCount } = args;
  const seasonLabel = boardingRateSeasonLabel(season);
  const dateLabel = formatBoardingDateRange(startDate, endDate);
  const nightsLabel = `${nightCount} night${nightCount !== 1 ? "s" : ""}`;
  return `${petName} — ${boardingLabel} — ${seasonLabel} — ${dateLabel} (${nightsLabel})`;
}

function boardAndTrainDescription(args: {
  petName: string;
  boardingLabel: string;
  startDate: string;
  endDate: string;
  nightCount: number;
}): string {
  const { petName, boardingLabel, startDate, endDate, nightCount } = args;
  const dateLabel = formatBoardingDateRange(startDate, endDate);
  const nightsLabel = `${nightCount} night${nightCount !== 1 ? "s" : ""}`;
  return `${petName} — ${boardingLabel} — ${dateLabel} (${nightsLabel})`;
}

export async function buildBoardingNightLineItems(args: {
  roomId: string | null;
  roomName?: string;
  petCount: number;
  pets?: BoardingInvoicePet[];
  checkInDate: string;
  checkOutDate: string;
  boardingType?: BoardingType;
}): Promise<BoardingInvoiceLineItem[]> {
  const {
    roomId,
    roomName,
    petCount,
    pets,
    checkInDate,
    checkOutDate,
    boardingType = "boarding_only",
  } = args;
  const nights = differenceInCalendarDays(parseISO(checkOutDate), parseISO(checkInDate));
  if (nights <= 0) return [];

  const billedPets = normalizePets(pets, petCount);
  const billedPetCount = billedPets.length;
  const stayRates = await resolveBoardingStayRates(
    roomId ?? "",
    billedPetCount,
    checkInDate,
    checkOutDate,
    boardingType,
  );

  const roomPrefix = roomName ? `${roomName} — ` : "";
  const serviceLabel = boardingType === "board_and_train" ? "Board & Train" : "Boarding";
  const boardingLabel = roomPrefix ? `${roomPrefix}${serviceLabel}` : serviceLabel;
  const lineItems: BoardingInvoiceLineItem[] = [];
  const pricingKey =
    boardingType === "board_and_train" ? "board_and_train_night" : "boarding_night";

  if (boardingType === "board_and_train") {
    const unitPrice = stayRates.nights[0]?.unitPrice ?? 0;
    const startDate = stayRates.nights[0]?.date ?? checkInDate;
    const endDate = stayRates.nights[stayRates.nights.length - 1]?.date ?? checkOutDate;
    for (const pet of billedPets) {
      lineItems.push({
        description: boardAndTrainDescription({
          petName: pet.name,
          boardingLabel,
          startDate,
          endDate,
          nightCount: nights,
        }),
        quantity: nights,
        unitPrice,
        pricingKey,
        serviceType: "boarding",
      });
    }
    return lineItems;
  }

  const seasonRuns = groupBoardingNightsByContiguousSeason(
    stayRates.nights.map((night) => ({
      date: night.date,
      season: night.season,
    })),
  );

  for (const pet of billedPets) {
    for (const run of seasonRuns) {
      const pricedNight = stayRates.nights.find((n) => n.date === run.startDate);
      const unitPrice = pricedNight?.unitPrice ?? 0;
      lineItems.push({
        description: boardingNightDescription({
          petName: pet.name,
          boardingLabel,
          season: run.season,
          startDate: run.startDate,
          endDate: run.endDate,
          nightCount: run.nights.length,
        }),
        quantity: run.nights.length,
        unitPrice,
        pricingKey: pricedNight?.pricingKey ?? pricingKey,
        serviceType: "boarding",
      });
    }
  }

  if (lineItems.length === 0) {
    for (const pet of billedPets) {
      lineItems.push({
        description: `${pet.name} — ${boardingLabel} — ${nights} night${nights !== 1 ? "s" : ""}`,
        quantity: nights,
        unitPrice: 0,
        pricingKey,
        serviceType: "boarding",
      });
    }
  }

  return lineItems;
}
