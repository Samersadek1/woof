import { format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PrintLayout } from "@/components/print/PrintLayout";
import {
  fetchGroomingRowsForDate,
  GroomingCardBlock,
} from "@/pages/print/groomingPrintShared";

function normalizedDate(value: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return format(new Date(), "yyyy-MM-dd");
}

export default function GroomingCardsPrintPage() {
  const [searchParams] = useSearchParams();
  const date = normalizedDate(searchParams.get("date"));

  const { data, isLoading, error } = useQuery({
    queryKey: ["print", "grooming-cards", date],
    queryFn: () => fetchGroomingRowsForDate(date),
  });

  return (
    <PrintLayout>
      <p className="print-sans mb-3 text-xs">Grooming cards for {date}</p>
      {isLoading ? <p className="print-sans text-sm">Loading appointments...</p> : null}
      {error ? (
        <p className="print-sans text-sm text-red-700">
          Could not load grooming appointments for this date.
        </p>
      ) : null}
      {!isLoading && !error && (data?.appointments.length ?? 0) === 0 ? (
        <p className="print-sans text-sm">No grooming appointments for this date.</p>
      ) : null}
      {data?.appointments.map((appointment) => (
        <GroomingCardBlock
          key={appointment.id}
          appointment={appointment}
          previousGroomDate={data.previousByPetId[appointment.pet_id] ?? null}
          invoiceMoney={data.amountByAppointmentId[appointment.id] ?? null}
        />
      ))}
    </PrintLayout>
  );
}
