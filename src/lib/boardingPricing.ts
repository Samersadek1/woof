import { supabase } from "@/integrations/supabase/client";

type BoardingRoomRow = {
  nightly_rate: number | null;
  capacity_type: string | null;
  room_type: string | null;
  pricing_category?: string | null;
  pricing_size_tier?: string | null;
};

type BoardingRate = {
  unitPrice: number;
  pricingKey: string;
};

type ResolveBoardingRateOptions = {
  checkInDate?: string | null;
  checkOutDate?: string | null;
};

const LEGACY_OCC_MULTIPLIER: Record<string, number> = {
  single: 1,
  twin: 1.5,
  twin_plus: 1.5,
  multiple: 2,
};

function occupancyTier(petCount: number): "single" | "double" | "triple" {
  if (petCount <= 1) return "single";
  if (petCount === 2) return "double";
  return "triple";
}

function legacyOccupancyKey(petCount: number): "single" | "twin" | "multiple" {
  if (petCount <= 1) return "single";
  if (petCount === 2) return "twin";
  return "multiple";
}

function buildPricingKeyCandidates(room: BoardingRoomRow, petCount: number): string[] {
  const tier = occupancyTier(petCount);
  const legacyTier = legacyOccupancyKey(petCount);
  const out: string[] = [];

  if (room.pricing_category) {
    out.push(`${room.pricing_category}_${tier}`);
    out.push(room.pricing_category);
  }

  if (room.room_type) {
    out.push(`${room.room_type}_${legacyTier}`);
    out.push(`${room.room_type}_${tier}`);
    out.push(room.room_type);
  }

  return Array.from(new Set(out));
}

export async function resolveBoardingRate(
  roomId: string,
  petCount: number,
  opts?: ResolveBoardingRateOptions,
): Promise<BoardingRate> {
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    // pricing_* columns are runtime columns that may be added by SQL migrations.
    .select("nightly_rate, capacity_type, room_type, pricing_category, pricing_size_tier")
    .eq("id", roomId)
    .single();

  if (roomErr) throw roomErr;
  const roomRow = room as unknown as BoardingRoomRow;

  const candidates = buildPricingKeyCandidates(roomRow, petCount);
  const resolvedCandidates: string[] = [];
  const hasDates = Boolean(opts?.checkInDate && opts?.checkOutDate);
  if (hasDates) {
    for (const key of candidates) {
      try {
        const { data: resolved } = await supabase.rpc("resolve_boarding_pricing_key", {
          p_base_key: key,
          p_check_in_date: opts!.checkInDate!,
          p_check_out_date: opts!.checkOutDate!,
        });
        if (typeof resolved === "string" && resolved.trim()) {
          resolvedCandidates.push(resolved);
        }
      } catch {
        // If RPC isn't available yet, fall back to base key candidates.
      }
    }
  }

  const mergedCandidates = Array.from(new Set([...resolvedCandidates, ...candidates]));
  if (mergedCandidates.length > 0) {
    const { data: pricingRows } = await supabase
      .from("pricing")
      .select("key, amount_aed")
      .in("key", mergedCandidates);

    const priceMap = new Map((pricingRows ?? []).map((r) => [r.key, r.amount_aed]));
    for (const key of mergedCandidates) {
      const amount = priceMap.get(key);
      if (typeof amount === "number") {
        return { unitPrice: amount, pricingKey: key };
      }
    }
  }

  // Last-resort fallback for legacy data.
  const legacyOcc = legacyOccupancyKey(petCount);
  const multiplier = LEGACY_OCC_MULTIPLIER[legacyOcc] ?? 1;
  const baseRate = roomRow.nightly_rate ?? 0;
  return {
    unitPrice: Math.round(baseRate * multiplier),
    pricingKey: roomRow.room_type ? `${roomRow.room_type}_${legacyOcc}` : `boarding_${legacyOcc}`,
  };
}

