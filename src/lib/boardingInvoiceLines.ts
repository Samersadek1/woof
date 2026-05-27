import { differenceInCalendarDays, parseISO } from "date-fns";
import { resolveBoardingStayRates } from "@/lib/boardingPricing";
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

export async function buildBoardingNightLineItems(args: {
  roomId: string | null;
  roomName?: string;
  petCount: number;
  pets?: BoardingInvoicePet[];
  checkInDate: string;
  checkOutDate: string;
}): Promise<BoardingInvoiceLineItem[]> {
  const { roomId, roomName, petCount, pets, checkInDate, checkOutDate } = args;
  const nights = differenceInCalendarDays(parseISO(checkOutDate), parseISO(checkInDate));
  if (nights <= 0) return [];

  const billedPets = normalizePets(pets, petCount);
  const billedPetCount = billedPets.length;
  const stayRates = await resolveBoardingStayRates(roomId ?? "", billedPetCount, checkInDate, checkOutDate);

  const roomPrefix = roomName ? `${roomName} — ` : "";
  const boardingLabel = roomPrefix ? `${roomPrefix}Boarding` : "Boarding";
  const lineItems: BoardingInvoiceLineItem[] = [];

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
        pricingKey: pricedNight?.pricingKey ?? "boarding_night",
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
        pricingKey: "boarding_night",
        serviceType: "boarding",
      });
    }
  }

  return lineItems;
}
