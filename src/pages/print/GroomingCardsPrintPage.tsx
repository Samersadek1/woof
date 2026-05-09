import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PrintLayout } from "@/components/print/PrintLayout";
import {
  fetchGroomingRowsForDateRange,
  GroomingSchedulePrintView,
} from "@/pages/print/groomingPrintShared";

function normalizedDate(value: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return format(new Date(), "yyyy-MM-dd");
}

/** Resolve optional date range; `date` sets both ends (backward compatible). */
function normalizedRange(searchParams: URLSearchParams): { from: string; to: string } {
  const fallback = normalizedDate(searchParams.get("date"));
  const fromRaw = searchParams.get("from") ?? searchParams.get("date");
  const toRaw = searchParams.get("to") ?? searchParams.get("date");
  const from = normalizedDate(fromRaw);
  const to = normalizedDate(toRaw);
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

export default function GroomingCardsPrintPage() {
  const [searchParams] = useSearchParams();
  const { from, to } = normalizedRange(searchParams);

  const { data, isLoading, error } = useQuery({
    queryKey: ["print", "grooming-cards", from, to],
    queryFn: () => fetchGroomingRowsForDateRange(from, to),
  });

  return (
    <PrintLayout variant="schedule">
      {isLoading ? <p className="print-sans text-sm">Loading appointments…</p> : null}
      {error ? (
        <p className="print-sans text-sm text-red-700">
          Could not load grooming appointments for this range.
        </p>
      ) : null}
      {!isLoading && !error && data ? (
        <GroomingSchedulePrintView
          appointments={data.appointments}
          dateFrom={from}
          dateTo={to}
        />
      ) : null}
    </PrintLayout>
  );
}
