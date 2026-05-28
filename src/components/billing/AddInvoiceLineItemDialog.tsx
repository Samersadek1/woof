import { useEffect, useState } from "react";
import { useAddInvoiceLineItem } from "@/hooks/useAddInvoiceLineItem";
import { useInvoicePricingRows } from "@/hooks/useInvoicePricingRows";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export interface AddInvoiceLineItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  ownerId: string;
  serviceType?: string | null;
  invoiceLabel?: string;
  onAdded?: () => void;
}

export function AddInvoiceLineItemDialog({
  open,
  onOpenChange,
  invoiceId,
  ownerId,
  serviceType,
  invoiceLabel,
  onAdded,
}: AddInvoiceLineItemDialogProps) {
  const addLine = useAddInvoiceLineItem();
  const [description, setDescription] = useState("");
  const [pricingKey, setPricingKey] = useState("");
  const [customMode, setCustomMode] = useState(true);
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const { data: pricingRows = [] } = useInvoicePricingRows(open);

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setPricingKey("");
    setCustomMode(true);
    setQuantity("1");
    setUnitPrice("");
  }, [open]);

  const handlePricingKeyChange = async (key: string) => {
    setPricingKey(key);
    if (!key) return;
    const row = pricingRows.find((r) => r.key === key);
    if (row) {
      setDescription(row.label);
      setUnitPrice(String(row.amount_aed));
      setCustomMode(false);
      return;
    }
    const { data, error } = await supabase.rpc("resolve_woof_service_rate", {
      p_service_code: key as Database["public"]["Enums"]["service_code"],
    });
    if (error) return;
    const resolved = (
      data as Database["public"]["Functions"]["resolve_woof_service_rate"]["Returns"]
    )[0];
    if (resolved) {
      setDescription(resolved.notes?.trim() || key);
      setUnitPrice(String(resolved.amount_aed));
      setCustomMode(false);
    }
  };

  const handleSubmit = async () => {
    const qty = parseInt(quantity, 10);
    const price = parseFloat(unitPrice);
    if (!description.trim()) return;
    if (!qty || qty < 1) return;
    if (Number.isNaN(price) || price < 0) return;

    await addLine.mutateAsync({
      invoiceId,
      ownerId,
      description: description.trim(),
      quantity: qty,
      unitPrice: price,
      pricingKey: customMode ? null : pricingKey || null,
      serviceType: serviceType ?? "other",
    });
    onOpenChange(false);
    onAdded?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="add-invoice-line-dialog">
        <DialogHeader>
          <DialogTitle>Add line item</DialogTitle>
          <DialogDescription>
            {invoiceLabel
              ? `Add a charge to invoice ${invoiceLabel}.`
              : "Add a charge to this invoice."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Rate (optional)</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={pricingKey}
              onChange={(e) => void handlePricingKeyChange(e.target.value)}
            >
              <option value="">Custom line…</option>
              {pricingRows.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label} — AED {r.amount_aed.toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Extra grooming"
              data-testid="add-invoice-line-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                data-testid="add-invoice-line-quantity"
              />
            </div>
            <div className="space-y-1">
              <Label>Unit price (AED)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={unitPrice}
                onChange={(e) => {
                  setUnitPrice(e.target.value);
                  setCustomMode(true);
                }}
                data-testid="add-invoice-line-unit-price"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addLine.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={addLine.isPending || !description.trim()}
            data-testid="add-invoice-line-submit"
          >
            {addLine.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add line
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
