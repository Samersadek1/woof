import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/dashboard/TopBar";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useOwners, useOwner } from "@/hooks/useOwners";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  netFromGrossInclusive,
  vatAmountFromGrossInclusive,
  vatLineLabel,
} from "@/lib/vatConfig";

type PricingRow = {
  key: Database["public"]["Enums"]["service_code"];
  label: string;
  amount_aed: number;
};
type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];
type InvoiceLineInsert = Database["public"]["Tables"]["invoice_line_items"]["Insert"];
type AdjustmentInsert = Database["public"]["Tables"]["billing_adjustments"]["Insert"];

type LineDraft = {
  id: string;
  description: string;
  pricingKey: string;
  customMode: boolean;
  quantity: number;
  unitPrice: number;
  total: number;
  discount: number;
  vat: number;
};

type AdjustmentDraft = {
  id: string;
  adjustment_type: string;
  amount: number;
  reason: string;
  approved_by: string;
};

function aed(v: number) {
  return `AED ${v.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CreateInvoicePage() {
  const navigate = useNavigate();
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [ownerSearchOpen, setOwnerSearchOpen] = useState(false);
  const [serviceType, setServiceType] = useState("other");
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 14), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([
    {
      id: crypto.randomUUID(),
      description: "",
      pricingKey: "",
      customMode: false,
      quantity: 1,
      unitPrice: 0,
      total: 0,
      discount: 0,
      vat: 0,
    },
  ]);
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);

  const { data: ownerHits = [] } = useOwners(ownerSearch.trim().length >= 2 ? ownerSearch : undefined);
  const { data: owner } = useOwner(ownerId || "");
  const linesRef = useRef(lines);
  const ownerSearchRef = useRef<HTMLDivElement>(null);
  linesRef.current = lines;
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([]);

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (ownerSearchRef.current && !ownerSearchRef.current.contains(event.target as Node)) {
        setOwnerSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  useMemo(() => {
    (async () => {
      const { data, error } = await supabase
        .from("service_rates")
        .select("service_code, amount_aed, service_code_meta!inner(display_name)")
        .is("pet_size", null)
        .is("coat_type", null)
        .is("season", null)
        .eq("is_active", true)
        .order("service_code");
      if (!error) {
        setPricingRows(
          (data ?? []).map((r) => ({
            key: r.service_code,
            label: r.service_code_meta?.display_name ?? r.service_code,
            amount_aed: r.amount_aed,
          })),
        );
      }
    })();
  }, []);

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: "",
        pricingKey: "",
        customMode: false,
        quantity: 1,
        unitPrice: 0,
        total: 0,
        discount: 0,
        vat: 0,
      },
    ]);

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));
  const patchLine = (id: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const resolveLine = async (line: LineDraft) => {
    if (line.customMode) {
      patchLine(line.id, {
        total: line.unitPrice * line.quantity,
        discount: 0,
        vat: 0,
      });
      return;
    }
    if (!line.pricingKey || !line.quantity) return;
    const { data, error } = await supabase.rpc("resolve_woof_service_rate", {
      p_service_code: line.pricingKey as Database["public"]["Enums"]["service_code"],
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const row = (data as Database["public"]["Functions"]["resolve_woof_service_rate"]["Returns"])[0];
    if (!row) return;
    patchLine(line.id, {
      unitPrice: row.amount_aed,
      total: row.amount_aed * line.quantity,
      discount: 0,
      vat: 0,
    });
  };

  useEffect(() => {
    if (!ownerId || !owner?.id) return;
    let cancelled = false;
    (async () => {
      for (const line of linesRef.current) {
        if (cancelled) return;
        if (line.customMode || !line.pricingKey || !line.quantity) continue;
        const { data, error } = await supabase.rpc("resolve_woof_service_rate", {
          p_service_code: line.pricingKey as Database["public"]["Enums"]["service_code"],
        });
        if (error || cancelled) continue;
        const row = (data as Database["public"]["Functions"]["resolve_woof_service_rate"]["Returns"])[0];
        if (!row) continue;
        if (cancelled) return;
        setLines((prev) =>
          prev.map((l) =>
            l.id === line.id
              ? {
                  ...l,
                  unitPrice: row.amount_aed,
                  total: row.amount_aed * line.quantity,
                  discount: 0,
                  vat: 0,
                }
              : l,
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerId, owner?.id]);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const lineDiscount = lines.reduce((s, l) => s + l.discount, 0);
  const lineTotal = lines.reduce((s, l) => s + l.total, 0);
  const adjustmentTotal = adjustments.reduce((s, a) => s + Math.max(0, a.amount), 0);
  const invoiceGross = Math.max(0, lineTotal - adjustmentTotal);
  const vatAed = vatAmountFromGrossInclusive(invoiceGross);
  const netExVat = netFromGrossInclusive(invoiceGross);

  const submit = async () => {
    if (!ownerId) return toast.error("Owner is required.");
    if (lines.length === 0) return toast.error("Add at least one line item.");
    if (lines.some((l) => !l.customMode && !l.pricingKey)) {
      return toast.error("Select pricing keys for non-custom lines.");
    }
    if (lines.some((l) => !l.description.trim())) {
      return toast.error("Each line needs a description.");
    }
    setSaving(true);
    try {
      const invoicePayload: InvoiceInsert = {
        owner_id: ownerId,
        service_type: serviceType,
        status: "finalised",
        due_date: dueDate,
        notes: notes.trim() || null,
        subtotal,
        subtotal_aed: subtotal,
        discount_amount: lineDiscount + adjustmentTotal,
        discount_aed: lineDiscount + adjustmentTotal,
        discount_pct: subtotal > 0 ? ((lineDiscount + adjustmentTotal) / subtotal) * 100 : 0,
        total: invoiceGross,
        total_aed: invoiceGross,
        vat_aed: vatAed,
      };
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert(invoicePayload)
        .select("id")
        .single();
      if (invErr) throw invErr;

      const lineRows: InvoiceLineInsert[] = lines.map((l, idx) => ({
        invoice_id: inv.id,
        description: l.description.trim(),
        pricing_key: l.customMode ? null : l.pricingKey,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        total_price: l.total,
        line_total: l.total,
        service_type: serviceType,
        sort_order: idx,
      }));
      const { error: linesErr } = await supabase.from("invoice_line_items").insert(lineRows);
      if (linesErr) throw linesErr;

      if (adjustments.length > 0) {
        const adjRows: AdjustmentInsert[] = adjustments.map((a) => ({
          owner_id: ownerId,
          invoice_id: inv.id,
          adjustment_type: a.adjustment_type,
          original_amount: subtotal,
          adjusted_amount: a.amount,
          reason: a.reason,
          approved_by: a.approved_by,
        }));
        const { error: adjErr } = await supabase.from("billing_adjustments").insert(adjRows);
        if (adjErr) throw adjErr;
      }

      toast.success("Invoice created.");
      navigate(`/billing/invoices/${inv.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar title="Create Manual Invoice" />
      <main className="flex-1 overflow-auto p-8 space-y-6">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div ref={ownerSearchRef} className="space-y-1">
              <Label>Owner</Label>
              <Input
                placeholder="Search owner by name or phone"
                value={ownerLabel || ownerSearch}
                onChange={(e) => {
                  setOwnerSearch(e.target.value);
                  setOwnerId("");
                  setOwnerLabel("");
                  setOwnerSearchOpen(true);
                }}
                onFocus={() => setOwnerSearchOpen(true)}
              />
              {ownerSearchOpen && ownerSearch.trim().length >= 2 && !ownerId && ownerHits.length > 0 && (
                <div className="rounded border bg-popover shadow-md max-h-48 overflow-auto">
                  {ownerHits.slice(0, 8).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setOwnerId(o.id);
                        setOwnerLabel(ownerDisplayName(o.first_name, o.last_name));
                        setOwnerSearch("");
                        setOwnerSearchOpen(false);
                      }}
                    >
                      {ownerDisplayName(o.first_name, o.last_name)} <span className="text-muted-foreground">{o.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {ownerId && owner?.id === ownerId && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Selected client</span>
                <span className="text-sm font-semibold">{ownerLabel}</span>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Service type</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                  {["boarding", "daycare", "grooming", "park", "transport", "training", "retail", "membership", "other"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Pricing basis</Label>
                <Input className="max-w-[14rem]" value="Woof service rates" disabled />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Line items</h3>
              <Button variant="outline" size="sm" onClick={addLine}>Add line</Button>
            </div>
            {lines.map((line) => (
              <div key={line.id} className="rounded-md border p-3 space-y-3">
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="md:col-span-2 space-y-1">
                    <Label>Description</Label>
                    <Input value={line.description} onChange={(e) => patchLine(line.id, { description: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Pricing key</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={line.customMode ? "__custom__" : line.pricingKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        const custom = val === "__custom__";
                        patchLine(line.id, { customMode: custom, pricingKey: custom ? "" : val });
                      }}
                    >
                      <option value="">Select key</option>
                      {pricingRows.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label} ({p.key})
                        </option>
                      ))}
                      <option value="__custom__">Custom</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => patchLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      onBlur={() => resolveLine(line)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Unit price</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => patchLine(line.id, { unitPrice: Number(e.target.value) || 0 })}
                      onBlur={() => resolveLine(line)}
                      disabled={!line.customMode}
                    />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
                  <span>Discount: {aed(line.discount)}</span>
                  <span>VAT: {aed(line.vat)}</span>
                  <span className="font-medium text-foreground">Line total: {aed(line.total)}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeLine(line.id)}>Remove</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Adjustments (optional)</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setAdjustments((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      adjustment_type: "discount_override",
                      amount: 0,
                      reason: "",
                      approved_by: "",
                    },
                  ])
                }
              >
                Add adjustment
              </Button>
            </div>
            {adjustments.map((a) => (
              <div key={a.id} className="grid gap-3 md:grid-cols-4 rounded-md border p-3">
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={a.adjustment_type}
                  onChange={(e) => setAdjustments((prev) => prev.map((x) => x.id === a.id ? { ...x, adjustment_type: e.target.value } : x))}
                >
                  <option value="discount_override">Discount</option>
                  <option value="goodwill_credit">Goodwill credit</option>
                  <option value="fee_waived">Fee waived</option>
                  <option value="adjustment">Adjustment</option>
                </select>
                <Input type="number" min="0" step="0.01" value={a.amount} onChange={(e) => setAdjustments((prev) => prev.map((x) => x.id === a.id ? { ...x, amount: Number(e.target.value) || 0 } : x))} />
                <Input placeholder="Reason" value={a.reason} onChange={(e) => setAdjustments((prev) => prev.map((x) => x.id === a.id ? { ...x, reason: e.target.value } : x))} />
                <Input placeholder="Approved by" value={a.approved_by} onChange={(e) => setAdjustments((prev) => prev.map((x) => x.id === a.id ? { ...x, approved_by: e.target.value } : x))} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="md:max-w-md ml-auto text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{aed(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discounts</span><span>-{aed(lineDiscount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Adjustments</span><span>-{aed(adjustmentTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Net (ex VAT)</span><span>{aed(netExVat)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{vatLineLabel()}</span><span>{aed(vatAed)}</span></div>
              <div className="flex justify-between text-base font-semibold border-t pt-2"><span>Total (incl. VAT)</span><span>{aed(invoiceGross)}</span></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate("/billing/invoices")}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Creating..." : "Create invoice"}</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
