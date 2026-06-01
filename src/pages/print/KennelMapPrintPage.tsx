import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { PrintLayout } from "@/components/print/PrintLayout";
import {
  useBoardingNightCapacity,
  useKennelMap,
  useUnassignedQueue,
} from "@/hooks/useBoardingCapacity";
import { KennelMapPrintView } from "@/pages/print/kennelMapPrintShared";

function normalizedDate(value: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return format(new Date(), "yyyy-MM-dd");
}

export default function KennelMapPrintPage() {
  const [searchParams] = useSearchParams();
  const date = normalizedDate(searchParams.get("date"));

  const { data: mapData, isLoading: mapLoading, error: mapError } = useKennelMap(date);
  const { data: queue = [], isLoading: queueLoading, error: queueError } = useUnassignedQueue(date);
  const { data: capacity, isLoading: capLoading } = useBoardingNightCapacity(date);

  const isLoading = mapLoading || queueLoading || capLoading;
  const error = mapError ?? queueError;

  return (
    <PrintLayout variant="map">
      {isLoading ? <p className="print-sans text-sm">Loading kennel map…</p> : null}
      {error ? (
        <p className="print-sans text-sm text-red-700">Could not load kennel map for this date.</p>
      ) : null}
      {!isLoading && !error && mapData ? (
        <KennelMapPrintView
          date={date}
          rooms={mapData.rooms}
          occ={mapData.occ}
          queue={queue}
          capacity={capacity}
        />
      ) : null}
    </PrintLayout>
  );
}
