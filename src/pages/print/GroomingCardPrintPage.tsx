import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PrintLayout } from "@/components/print/PrintLayout";
import {
  fetchGroomingRowById,
  GroomingCardBlock,
} from "@/pages/print/groomingPrintShared";

export default function GroomingCardPrintPage() {
  const { bookingId } = useParams<{ bookingId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["print", "grooming-card", bookingId],
    enabled: !!bookingId,
    queryFn: () => fetchGroomingRowById(bookingId!),
  });

  return (
    <PrintLayout>
      {isLoading ? <p className="print-sans text-sm">Loading grooming card...</p> : null}
      {error ? (
        <p className="print-sans text-sm text-red-700">
          Could not load grooming appointment.
        </p>
      ) : null}
      {data ? (
        <GroomingCardBlock
          appointment={data.appointment}
          previousGroomDate={data.previousGroomDate}
          invoiceMoney={data.invoiceMoney}
        />
      ) : null}
    </PrintLayout>
  );
}
