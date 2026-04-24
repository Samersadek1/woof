import { useMemo } from "react";
import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PrintLayout } from "@/components/print/PrintLayout";
import {
  fetchKennelCardsAsOf,
  kennelCardImageUrls,
  KennelCardBlock,
} from "@/pages/print/kennelPrintShared";

function normalizedDate(value: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return format(new Date(), "yyyy-MM-dd");
}

export default function KennelCardsPrintPage() {
  const [searchParams] = useSearchParams();
  const asOf = normalizedDate(searchParams.get("date"));
  const compact = searchParams.get("compact") === "1";

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["print", "kennel-cards", asOf],
    queryFn: () => fetchKennelCardsAsOf(asOf),
  });

  const imageUrls = useMemo(
    () => data.flatMap((booking) => kennelCardImageUrls(booking)),
    [data],
  );

  return (
    <PrintLayout imageUrls={imageUrls}>
      <p className="print-sans mb-3 text-xs">Kennel cards as of {asOf}</p>
      {isLoading ? <p className="print-sans text-sm">Loading cards...</p> : null}
      {error ? (
        <p className="print-sans text-sm text-red-700">
          Could not load boarding bookings for this date.
        </p>
      ) : null}
      {!isLoading && !error && data.length === 0 ? (
        <p className="print-sans text-sm">No active boarding guests for this date.</p>
      ) : null}
      {data.map((booking) => (
        <KennelCardBlock key={booking.id} booking={booking} compact={compact} />
      ))}
    </PrintLayout>
  );
}
