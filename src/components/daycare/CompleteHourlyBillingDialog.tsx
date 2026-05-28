import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { createServiceInvoice, removeUnpaidServiceInvoice } from "@/lib/bookingUtils";
import { composeNotesWithHourlyInvoiced } from "@/lib/daycareSessionMeta";
import {
  buildPriceMap,
  daycareHourlyInvoiceLineUnits,
  daycareHourlyPetSubtotal,
  DAYCARE_HOURLY_UNIT_KEY,
} from "@/lib/servicePricing";
import { formatAed, parseBoundedDecimalInput } from "@/lib/money";
import {
  netFromGrossInclusive,
  vatAmountFromGrossInclusive,
  vatLineLabel,
} from "@/lib/vatConfig";
import { toast } from "sonner";

export type HourlyBillingSession = {
  id: string;
  petId: string;
  petName: string;
  notes?: string | null;
};

type CompleteHourlyBillingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string;
  ownerName: string;
  sessions: HourlyBillingSession[];
  onSuccess?: () => void;
};

function formatHourLabel(hours: number): string {
  return Number.isInteger(hours)
    ? String(hours)
    : hours.toLocaleString("en-AE", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
}

export function CompleteHourlyBillingDialog({
  open,
  onOpenChange,
  ownerId,
  ownerName,
  sessions,
  onSuccess,
}: CompleteHourlyBillingDialogProps) {
  const [hoursByPetId, setHoursByPetId] = useState<Record<string, string>>({});
  const [skipInvoiceDiscount, setSkipInvoiceDiscount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHoursByPetId((prev) => {
      const next: Record<string, string> = {};
      for (const session of sessions) {
        next[session.petId] = prev[session.petId] ?? "1";
      }
      return next;
    });
    setSkipInvoiceDiscount(false);
  }, [open, sessions]);

  const { data: pricingRows = [] } = useQuery<{ key: string; amount_aed: number }[]>({
    queryKey: ["pricing", "daycare_hourly_complete"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_woof_service_rate", {
        p_service_code: "daycare_hourly",
      });
      if (error) throw error;
      const hourlyAmount = (data as { amount_aed: number }[] | null)?.[0]?.amount_aed ?? 0;
      return [{ key: DAYCARE_HOURLY_UNIT_KEY, amount_aed: hourlyAmount }];
    },
  });

  const priceMap = useMemo(() => buildPriceMap(pricingRows), [pricingRows]);

  const rowPreviews = useMemo(() => {
    return sessions.map((session) => {
      const rawHours = parseBoundedDecimalInput(hoursByPetId[session.petId] ?? "1", 1, {
        min: 0.5,
        max: 48,
      });
      const subtotal = daycareHourlyPetSubtotal(rawHours, priceMap);
      return { session, rawHours, subtotal };
    });
  }, [sessions, hoursByPetId, priceMap]);

  const invoiceSubtotal = rowPreviews.reduce((sum, row) => sum + row.subtotal.total, 0);

  const { data: discountPreview, isLoading: discountPreviewLoading } = useQuery<{
    discount_pct: number;
    discount_aed: number;
    final_aed: number;
  }>({
    queryKey: [
      "daycare",
      "hourly-complete-discount",
      ownerId,
      invoiceSubtotal,
      skipInvoiceDiscount,
    ],
    enabled: open && invoiceSubtotal > 0 && !skipInvoiceDiscount,
    queryFn: async () => ({
      discount_pct: 0,
      discount_aed: 0,
      final_aed: invoiceSubtotal,
    }),
  });

  const invoiceNetExVat = useMemo(() => {
    if (invoiceSubtotal <= 0) return null;
    if (skipInvoiceDiscount) return invoiceSubtotal;
    if (discountPreviewLoading) return invoiceSubtotal;
    return discountPreview?.final_aed ?? invoiceSubtotal;
  }, [invoiceSubtotal, skipInvoiceDiscount, discountPreviewLoading, discountPreview?.final_aed]);

  const canSubmit = rowPreviews.every((row) => row.subtotal.roundedHours > 0);

  const handleGenerateInvoice = async () => {
    if (!canSubmit || sessions.length === 0) {
      toast.error("Enter billable hours for each dog");
      return;
    }

    const lineItems = rowPreviews
      .filter((row) => row.subtotal.total > 0)
      .map((row) => {
        const lineUnits = daycareHourlyInvoiceLineUnits(
          row.subtotal.roundedHours,
          row.subtotal.unitRate,
        );
        return {
          description: `Daycare hourly — ${row.session.petName} (${formatHourLabel(lineUnits.roundedHours)} hr)`,
          quantity: lineUnits.quantity,
          unitPrice: lineUnits.unitPrice,
          pricingKey: row.subtotal.pricingKey,
          serviceType: "daycare",
          preserveUnitPrice: true,
        };
      });

    if (lineItems.length === 0) {
      toast.error("Enter billable hours for each dog");
      return;
    }

    setIsSubmitting(true);
    let invoiceId: string | null = null;
    try {
      invoiceId = await createServiceInvoice({
        ownerId,
        serviceType: "daycare",
        referenceId: sessions[0].id,
        lineItems,
        invoiceStatus: "finalised",
        skipMemberDiscount: skipInvoiceDiscount,
      });

      const updateResults = await Promise.all(
        sessions.map(async (session) => {
          const { error } = await supabase
            .from("daycare_sessions")
            .update({
              notes: composeNotesWithHourlyInvoiced(session.notes ?? null, invoiceId!),
            })
            .eq("id", session.id);
          return { sessionId: session.id, error };
        }),
      );

      const failed = updateResults.filter((r) => r.error);
      if (failed.length > 0) {
        if (invoiceId) {
          try {
            await removeUnpaidServiceInvoice(invoiceId);
          } catch {
            toast.error(
              "Sessions were not marked as billed and the invoice could not be rolled back. Check Billing before retrying.",
            );
            onOpenChange(false);
            onSuccess?.();
            return;
          }
        }
        throw new Error(
          "Could not mark all dogs as billed. No invoice was saved — you can try again.",
        );
      }

      toast.success("Hourly daycare invoice generated");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate invoice";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ownerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {rowPreviews.map(({ session, subtotal }) => (
            <div
              key={session.id}
              className="flex flex-wrap items-end justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="space-y-1.5 min-w-[8rem] flex-1">
                <p className="text-sm font-medium">{session.petName}</p>
                <div className="space-y-1">
                  <Label htmlFor={`hourly_hours_${session.petId}`} className="text-xs text-muted-foreground">
                    Hours
                  </Label>
                  <Input
                    id={`hourly_hours_${session.petId}`}
                    type="number"
                    min={0.5}
                    max={48}
                    step={0.5}
                    inputMode="decimal"
                    className="h-8 max-w-[7rem]"
                    value={hoursByPetId[session.petId] ?? "1"}
                    onChange={(e) =>
                      setHoursByPetId((prev) => ({ ...prev, [session.petId]: e.target.value }))
                    }
                    data-testid={`daycare-hourly-hours-${session.petId}`}
                  />
                </div>
              </div>
              <div className="text-right text-sm">
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="font-medium tabular-nums">{formatAed(subtotal.total)}</p>
                {subtotal.roundedHours > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatAed(subtotal.unitRate)} × {formatHourLabel(subtotal.roundedHours)} hr
                  </p>
                )}
              </div>
            </div>
          ))}

          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Auto pricing preview</p>
            {invoiceSubtotal <= 0 ? (
              <p className="text-sm text-muted-foreground">Enter hours to preview the invoice.</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatAed(invoiceSubtotal)}</span>
                </div>
                <div className="flex flex-col gap-2 rounded-md border bg-background/80 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="hourly_skip_discount"
                      checked={skipInvoiceDiscount}
                      onCheckedChange={setSkipInvoiceDiscount}
                    />
                    <Label htmlFor="hourly_skip_discount" className="text-sm font-normal cursor-pointer">
                      Bill without member discount
                    </Label>
                  </div>
                  {skipInvoiceDiscount && (
                    <span className="text-xs text-muted-foreground sm:text-right">
                      Profile discount will not be applied to this invoice.
                    </span>
                  )}
                </div>
                {!skipInvoiceDiscount && (
                  <div className="flex items-center justify-between text-sm text-emerald-700">
                    <span>
                      Auto discount
                      {discountPreview?.discount_pct
                        ? ` (${discountPreview.discount_pct.toFixed(2)}%)`
                        : ""}
                    </span>
                    <span>- {formatAed(discountPreview?.discount_aed ?? 0)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span>Net (ex VAT)</span>
                  <span className="tabular-nums">
                    {invoiceNetExVat != null ? formatAed(netFromGrossInclusive(invoiceNetExVat)) : "—"}
                  </span>
                </div>
                {invoiceNetExVat != null ? (
                  <div className="flex items-center justify-between text-sm">
                    <span>{vatLineLabel()}</span>
                    <span className="tabular-nums">
                      {formatAed(vatAmountFromGrossInclusive(invoiceNetExVat))}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between font-semibold">
                  <span>Total incl. VAT</span>
                  <span className="tabular-nums">
                    {invoiceNetExVat != null ? formatAed(Math.max(0, invoiceNetExVat)) : "—"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            onClick={() => void handleGenerateInvoice()}
            disabled={isSubmitting || !canSubmit}
            data-testid="daycare-hourly-generate-invoice-btn"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Invoice
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-muted-foreground"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
