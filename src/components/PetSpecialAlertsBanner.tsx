import type { Json } from "@/integrations/supabase/types";
import { parsePetSpecialAlerts, petAlertBannerLines } from "@/lib/petAlerts";

type Props = {
  specialAlerts: Json | null | undefined;
  className?: string;
};

/**
 * Red/orange warning strip for booking modals when the pet has saved alerts.
 */
export function PetSpecialAlertsBanner({ specialAlerts, className }: Props) {
  const lines = petAlertBannerLines(parsePetSpecialAlerts(specialAlerts));
  if (lines.length === 0) return null;
  const text = lines.join(" · ");
  return (
    <div
      role="alert"
      className={
        className ??
        "rounded-md border border-orange-400/80 bg-gradient-to-r from-orange-50 to-red-50 px-3 py-2 text-sm text-orange-950 shadow-sm"
      }
    >
      <span className="font-medium">⚠️ Alert:</span> {text}
    </div>
  );
}
