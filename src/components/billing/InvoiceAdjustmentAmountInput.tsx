import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  type InvoiceDiscountMode,
  isPercentDiscountAdjustmentType,
  resolveAdjustmentDiscountAmount,
} from "@/lib/invoiceAdjustmentDiscount";

function aed(v: number) {
  return `AED ${v.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface InvoiceAdjustmentAmountInputProps {
  adjustmentType: string;
  subtotal: number;
  mode: InvoiceDiscountMode;
  onModeChange: (mode: InvoiceDiscountMode) => void;
  value: string;
  onValueChange: (value: string) => void;
}

export function InvoiceAdjustmentAmountInput({
  adjustmentType,
  subtotal,
  mode,
  onModeChange,
  value,
  onValueChange,
}: InvoiceAdjustmentAmountInputProps) {
  const percentDiscount = isPercentDiscountAdjustmentType(adjustmentType);
  const parsed = parseFloat(value);
  const resolvedFlat =
    Number.isFinite(parsed) && parsed > 0
      ? resolveAdjustmentDiscountAmount(percentDiscount ? mode : "flat", parsed, subtotal)
      : 0;

  return (
    <div className="space-y-2">
      {percentDiscount && (
        <div className="space-y-1">
          <Label>Discount basis</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={mode}
            onChange={(e) => onModeChange(e.target.value as InvoiceDiscountMode)}
            data-testid="invoice-adjustment-discount-mode"
          >
            <option value="percent">Percentage (%)</option>
            <option value="flat">Flat rate (AED)</option>
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label>{percentDiscount && mode === "percent" ? "Discount (%)" : "Amount (AED)"}</Label>
        <Input
          type="number"
          min="0"
          step={percentDiscount && mode === "percent" ? "0.01" : "0.01"}
          max={percentDiscount && mode === "percent" ? "100" : undefined}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={percentDiscount && mode === "percent" ? "e.g. 10" : "e.g. 50.00"}
          data-testid="invoice-adjustment-amount"
        />
      </div>
      {percentDiscount && mode === "percent" && resolvedFlat > 0 && (
        <p className="text-xs text-muted-foreground">
          Equals {aed(resolvedFlat)} off subtotal {aed(subtotal)}
        </p>
      )}
    </div>
  );
}
