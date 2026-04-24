import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PrintLayout } from "@/components/print/PrintLayout";
import {
  fetchKennelCardData,
  kennelCardImageUrls,
  KennelCardBlock,
} from "@/pages/print/kennelPrintShared";

export default function KennelCardPrintPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const compact = searchParams.get("compact") === "1";

  const { data, isLoading, error } = useQuery({
    queryKey: ["print", "kennel-card", bookingId],
    enabled: !!bookingId,
    queryFn: () => fetchKennelCardData(bookingId!),
  });

  const imageUrls = useMemo(() => (data ? kennelCardImageUrls(data) : []), [data]);

  return (
    <PrintLayout imageUrls={imageUrls}>
      {isLoading ? <p className="print-sans text-sm">Loading kennel card...</p> : null}
      {error ? (
        <p className="print-sans text-sm text-red-700">
          Could not load kennel card data.
        </p>
      ) : null}
      {data ? <KennelCardBlock booking={data} compact={compact} /> : null}
    </PrintLayout>
  );
}
