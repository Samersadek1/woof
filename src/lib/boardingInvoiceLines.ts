import { differenceInCalendarDays, parseISO } from "date-fns";
import { resolveBoardingStayRates } from "@/lib/boardingPricing";
import { boardingRateSeasonLabel } from "@/lib/boardingSeason";

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

export async function buildBoardingNightLineItems(args: {
  roomId: string | null;
  roomName?: string;
  petCount: number;
  checkInDate: string;
  checkOutDate: string;
}): Promise<BoardingInvoiceLineItem[]> {
  const { roomId, roomName, petCount, checkInDate, checkOutDate } = args;
  const nights = differenceInCalendarDays(parseISO(checkOutDate), parseISO(checkInDate));
  if (nights <= 0) return [];

  const stayRates = await resolveBoardingStayRates(roomId ?? "", petCount, checkInDate, checkOutDate);
  void petCount;

  const roomPrefix = roomName ? `${roomName} — ` : "";
  const boardingLabel = roomPrefix ? `${roomPrefix}Boarding` : "Boarding";
  const lineItems: BoardingInvoiceLineItem[] = [];

  const pushNightGroup = (
    groupNights: typeof stayRates.nights,
    season: "peak" | "off_peak",
  ) => {
    if (groupNights.length === 0) return;
    const unitPrice = groupNights[0].unitPrice;
    const seasonLabel = boardingRateSeasonLabel(season);
    lineItems.push({
      description: `${boardingLabel} — ${groupNights.length} ${seasonLabel.toLowerCase()} night${groupNights.length !== 1 ? "s" : ""}`,
      quantity: groupNights.length,
      unitPrice,
      pricingKey: groupNights[0].pricingKey,
      serviceType: "boarding",
    });
  };

  pushNightGroup(
    stayRates.nights.filter((n) => n.isPeak),
    "peak",
  );
  pushNightGroup(
    stayRates.nights.filter((n) => !n.isPeak),
    "off_peak",
  );

  if (lineItems.length === 0) {
    lineItems.push({
      description: `${boardingLabel} — ${nights} night${nights !== 1 ? "s" : ""}`,
      quantity: nights,
      unitPrice: 0,
      pricingKey: "boarding_night",
      serviceType: "boarding",
    });
  }

  return lineItems;
}
