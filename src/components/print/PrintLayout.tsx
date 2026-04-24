import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export function PrintLayout({
  children,
  imageUrls = [],
}: {
  children: React.ReactNode;
  imageUrls?: Array<string | null | undefined>;
}) {
  const [imagesReady, setImagesReady] = useState(false);

  const trackedImages = useMemo(() => {
    return Array.from(
      new Set(
        imageUrls
          .map((url) => (typeof url === "string" ? url.trim() : ""))
          .filter((url) => url.length > 0),
      ),
    );
  }, [imageUrls]);

  useEffect(() => {
    if (trackedImages.length === 0) {
      setImagesReady(true);
      return;
    }

    let cancelled = false;
    setImagesReady(false);

    Promise.all(
      trackedImages.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = src;
            if (img.complete) resolve();
          }),
      ),
    ).then(() => {
      if (!cancelled) setImagesReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [trackedImages]);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A5; margin: 10mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; break-after: page; }
          .print-page:last-child { page-break-after: auto; break-after: auto; }
        }

        .print-root {
          color-scheme: light;
          background: #fff;
          color: #000;
          font-family: Georgia, "Times New Roman", serif;
        }

        .print-label,
        .print-sans {
          font-family: "Helvetica Neue", Arial, sans-serif;
        }

        .print-keep-color {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      <div className="print-root min-h-screen">
        <div className="no-print sticky top-0 z-10 border-b bg-white p-3 print-sans">
          <div className="mx-auto flex max-w-[600px] items-center gap-2">
            {imagesReady ? (
              <Button onClick={() => window.print()}>Print</Button>
            ) : (
              <Button disabled>Loading photos...</Button>
            )}
            <Button variant="outline" onClick={() => window.history.back()}>
              Back
            </Button>
          </div>
        </div>

        <div className="mx-auto max-w-[600px] p-6 print:max-w-none print:p-0">
          {children}
        </div>
      </div>
    </>
  );
}
