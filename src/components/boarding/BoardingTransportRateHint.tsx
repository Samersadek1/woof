import { Badge } from "@/components/ui/badge";
import {
  privateDubaiOverCapacity,
  transportQuantityForPets,
  TRANSPORT_ZONE_OPTIONS,
  type TransportZone,
} from "@/lib/transportPricing";
import { boardingTransportFreePromoFromRegion } from "@/lib/transportPricing";

export function BoardingTransportRateHint({
  activeRate,
  zone,
  petCount,
  pickup,
  dropoff,
  promo,
  petNoun,
  freeOfCharge,
}: {
  activeRate?: { amount_aed: number };
  zone: TransportZone;
  petCount: number;
  pickup: boolean;
  dropoff: boolean;
  promo: ReturnType<typeof boardingTransportFreePromoFromRegion>;
  petNoun: "dog" | "cat";
  /** Staff override: transport included at no cost (in addition to stay-length promos). */
  freeOfCharge?: boolean;
}) {
  if (!pickup && !dropoff) return null;
  const over = privateDubaiOverCapacity(zone, petCount);
  const capGroup = petNoun === "dog" ? "dogs" : "pets";
  const showFree = promo.applies || !!freeOfCharge;
  const freeBadge = (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800 shrink-0">
      Free
    </Badge>
  );
  if (showFree) {
    return (
      <div className="space-y-2">
        <div className="space-y-1.5">
          {pickup && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Pickup (one-way)</span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-emerald-700">Free</span>
                {freeBadge}
              </span>
            </div>
          )}
          {dropoff && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Drop-off (one-way)</span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-emerald-700">Free</span>
                {freeBadge}
              </span>
            </div>
          )}
        </div>
        {over && (
          <p className="text-xs text-destructive">
            Private is capped at 3 {capGroup}. Split the group or choose Dubai — Shared.
          </p>
        )}
      </div>
    );
  }
  if (!activeRate) return null;
  const qty = transportQuantityForPets(zone, Math.max(1, petCount));
  const opt = TRANSPORT_ZONE_OPTIONS.find((o) => o.value === zone);
  return (
    <>
      <p className="text-xs text-muted-foreground">
        AED {activeRate.amount_aed.toFixed(2)} × {qty}
        {zone === "dubai_private" ? " (flat per trip)" : ` per ${petNoun}`}
        {opt ? ` — ${opt.helper}` : ""}
      </p>
      {over && (
        <p className="text-xs text-destructive">
          Private is capped at 3 {capGroup}. Split the group or choose Dubai — Shared.
        </p>
      )}
    </>
  );
}
