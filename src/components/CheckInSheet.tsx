import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2, Trash2, Camera, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { StaffNameSelect } from "@/components/staff/StaffNameSelect";
import { PaymentSplitDialog } from "@/components/billing/PaymentSplitDialog";
import { useAccountBalance, accountBalanceQueryKey } from "@/hooks/useAccountBalance";
import { formatAed } from "@/hooks/useBilling";
import { recordExternalInvoicePayment } from "@/lib/recordExternalInvoicePayment";
import { invoiceDisplayTotals } from "@/lib/vatConfig";
import { WALLET_TOPUP_PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethod";
import type { ExternalPaymentMethod } from "@/lib/paymentMethod";
import {
  useBookingItems,
  useCreateBookingItem,
  useDeleteBookingItem,
  useUpdateBookingItem,
  useUploadItemPhoto,
  useUploadStagedItemPhoto,
  uploadOverviewPhoto,
  type BookingItem,
} from "@/hooks/useBookingItems";
import { useCheckIn, useUpdateBooking } from "@/hooks/useBookings";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  PET_CARE_NOTES_SELECT,
  petFeedingNotes,
  petMedicationNotes,
} from "@/lib/petCareNotes";

export const OVERVIEW_ITEM_DESCRIPTION = "Overview — belongings (group photo)";

const THUMB = "h-[60px] w-[60px] rounded object-cover border border-border shrink-0";

type DraftRow = {
  key: string;
  dbId?: string;
  category: "personal" | "food";
  description: string;
  quantity: number;
  condition_notes: string;
  photo_urls: string[];
};

type CareRow = {
  id: string;
  petName: string;
  feeding_am: string;
  feeding_pm: string;
  medication_am: string;
  medication_pm: string;
  special_instructions: string;
};

function splitAmPmNotes(raw: string): { am: string; pm: string } {
  const text = raw.trim();
  if (!text) return { am: "", pm: "" };
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const amLine = lines.find((l) => /^am\s*:/i.test(l));
  const pmLine = lines.find((l) => /^pm\s*:/i.test(l));
  if (amLine || pmLine) {
    return {
      am: amLine ? amLine.replace(/^am\s*:/i, "").trim() : "",
      pm: pmLine ? pmLine.replace(/^pm\s*:/i, "").trim() : "",
    };
  }
  // Backward compatibility for existing single-value notes.
  return { am: text, pm: "" };
}

function composeAmPmNotes(am: string, pm: string): string {
  const a = am.trim();
  const p = pm.trim();
  const parts: string[] = [];
  if (a) parts.push(`AM: ${a}`);
  if (p) parts.push(`PM: ${p}`);
  return parts.join("\n");
}

function newRow(category: "personal" | "food"): DraftRow {
  return {
    key: crypto.randomUUID(),
    category,
    description: "",
    quantity: 1,
    condition_notes: "",
    photo_urls: [],
  };
}

function itemToDraft(it: BookingItem): DraftRow {
  return {
    key: it.id,
    dbId: it.id,
    category: it.category as "personal" | "food",
    description: it.description,
    quantity: it.quantity,
    condition_notes: it.condition_notes ?? "",
    photo_urls: [...(it.photo_urls ?? [])],
  };
}

export type CheckInSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  ownerName: string;
  petNames: string;
  roomName: string;
  bookedCheckInDate: string;
  bookedCheckOutDate: string;
  readOnly?: boolean;
  onFinished?: () => void;
};

export function CheckInSheet({
  open,
  onOpenChange,
  bookingId,
  ownerName,
  petNames,
  roomName,
  bookedCheckInDate,
  bookedCheckOutDate,
  readOnly,
  onFinished,
}: CheckInSheetProps) {
  const { data: serverItems = [], isLoading } = useBookingItems(bookingId);
  const createItem = useCreateBookingItem();
  const updateItem = useUpdateBookingItem();
  const deleteItem = useDeleteBookingItem();
  const uploadItemPhoto = useUploadItemPhoto();
  const uploadStaged = useUploadStagedItemPhoto();
  const checkIn = useCheckIn();
  const updateBooking = useUpdateBooking();
  const queryClient = useQueryClient();

  // Check-in payment: load the booking's owner + its current (non-voided) invoice.
  const checkInBillingKey = ["checkin-billing", bookingId] as const;
  const { data: checkInBilling } = useQuery({
    queryKey: checkInBillingKey,
    enabled: open && !readOnly && !!bookingId,
    queryFn: async () => {
      const { data: booking } = await supabase
        .from("bookings")
        .select("owner_id")
        .eq("id", bookingId)
        .maybeSingle();
      const ownerId = (booking?.owner_id as string | undefined) ?? undefined;
      const { data: inv } = await supabase
        .from("invoices")
        .select(
          "id, total, vat_aed, service_type, notes, status, amount_paid, deposit_bypassed, deposit_bypass_reason",
        )
        .eq("booking_id", bookingId)
        .neq("status", "voided")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ownerId, invoice: inv ?? null };
    },
  });
  const billingOwnerId = checkInBilling?.ownerId;
  const checkInInvoice = checkInBilling?.invoice ?? null;
  const { data: account } = useAccountBalance(billingOwnerId);

  const invoiceGrandTotal = checkInInvoice
    ? invoiceDisplayTotals({
        total: checkInInvoice.total,
        vat_aed: checkInInvoice.vat_aed,
        service_type: checkInInvoice.service_type,
        notes: checkInInvoice.notes,
      }).grandTotal
    : 0;
  const invoiceRemaining = Math.max(0, invoiceGrandTotal - (checkInInvoice?.amount_paid ?? 0));

  const [payStaff, setPayStaff] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<ExternalPaymentMethod>("card");
  const [bypassReason, setBypassReason] = useState("");
  const [payFullOpen, setPayFullOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);

  const refreshBilling = async () => {
    await queryClient.invalidateQueries({ queryKey: checkInBillingKey });
    if (billingOwnerId) {
      await queryClient.invalidateQueries({
        queryKey: accountBalanceQueryKey(billingOwnerId),
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["invoice-alerts"] });
  };

  const handleDeposit = async () => {
    if (!checkInInvoice) {
      toast.error("No invoice found for this booking");
      return;
    }
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a deposit amount");
      return;
    }
    if (!payStaff.trim()) {
      toast.error("Enter staff name");
      return;
    }
    setPayBusy(true);
    try {
      if (checkInInvoice.status === "draft") {
        await supabase
          .from("invoices")
          .update({ status: "outstanding" })
          .eq("id", checkInInvoice.id)
          .eq("status", "draft");
      }
      const res = await recordExternalInvoicePayment(supabase, {
        invoiceId: checkInInvoice.id,
        method: depositMethod,
        performedBy: payStaff.trim(),
        amountAed: amt,
        note: "Deposit at check-in",
      });
      if (!res.success) throw new Error(res.error || "Deposit failed");
      toast.success("Deposit recorded");
      setDepositAmount("");
      await refreshBilling();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setPayBusy(false);
    }
  };

  const handleBypass = async () => {
    if (!checkInInvoice) {
      toast.error("No invoice found for this booking");
      return;
    }
    if (!bypassReason.trim()) {
      toast.error("A bypass reason is required");
      return;
    }
    setPayBusy(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          deposit_bypassed: true,
          deposit_bypass_reason: bypassReason.trim(),
        })
        .eq("id", checkInInvoice.id);
      if (error) throw new Error(error.message);
      toast.success("Deposit bypassed — logged for review");
      await refreshBilling();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bypass failed");
    } finally {
      setPayBusy(false);
    }
  };

  const [personal, setPersonal] = useState<DraftRow[]>([]);
  const [food, setFood] = useState<DraftRow[]>([]);
  const [overviewUrls, setOverviewUrls] = useState<string[]>([]);
  const [overviewDbId, setOverviewDbId] = useState<string | undefined>();
  const [actualCheckInDate, setActualCheckInDate] = useState(bookedCheckInDate);
  const [careRows, setCareRows] = useState<CareRow[]>([]);
  const [careLoading, setCareLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const draftsRef = useRef({ personal, food });
  draftsRef.current = { personal, food };
  const photoTarget = useRef<
    { kind: "row"; rowKey: string } | { kind: "overview" } | null
  >(null);

  const resetFromServer = useCallback(() => {
    const overview = serverItems.find((i) => i.description === OVERVIEW_ITEM_DESCRIPTION);
    setOverviewUrls([...(overview?.photo_urls ?? [])]);
    setOverviewDbId(overview?.id);
    const rest = serverItems.filter((i) => i.description !== OVERVIEW_ITEM_DESCRIPTION);
    setPersonal(rest.filter((i) => i.category === "personal").map(itemToDraft));
    setFood(rest.filter((i) => i.category === "food").map(itemToDraft));
    setActualCheckInDate(bookedCheckInDate);
  }, [serverItems, bookedCheckInDate]);

  const initBookingRef = useRef("");
  useEffect(() => {
    if (!open || readOnly) {
      initBookingRef.current = "";
      return;
    }
    if (isLoading) return;
    if (initBookingRef.current === bookingId) return;
    initBookingRef.current = bookingId;
    resetFromServer();
  }, [open, readOnly, isLoading, bookingId, resetFromServer]);

  useEffect(() => {
    if (open) setActualCheckInDate(bookedCheckInDate);
  }, [open, bookedCheckInDate]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCareLoading(true);
    void supabase
      .from("booking_pets")
      .select(`id, feeding_notes, medication_notes, special_instructions, pets(name, ${PET_CARE_NOTES_SELECT}, other_notes)`)
      .eq("booking_id", bookingId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setCareRows([]);
          setCareLoading(false);
          return;
        }
        type BookingCareRow = {
          id: string;
          feeding_notes: string | null;
          medication_notes: string | null;
          special_instructions: string | null;
          pets: {
            name: string | null;
            feeding_notes: string | null;
            medication_notes: string | null;
            feeding_instructions: string | null;
            medications: string | null;
            other_notes: string | null;
          } | null;
        };
        const mapped = ((data ?? []) as BookingCareRow[]).map((row) => ({
          id: row.id,
          petName: row.pets?.name ?? "Pet",
          feeding_am: splitAmPmNotes(
            row.feeding_notes?.trim() || petFeedingNotes(row.pets ?? undefined),
          ).am,
          feeding_pm: splitAmPmNotes(
            row.feeding_notes?.trim() || petFeedingNotes(row.pets ?? undefined),
          ).pm,
          medication_am: splitAmPmNotes(
            row.medication_notes?.trim() || petMedicationNotes(row.pets ?? undefined),
          ).am,
          medication_pm: splitAmPmNotes(
            row.medication_notes?.trim() || petMedicationNotes(row.pets ?? undefined),
          ).pm,
          special_instructions: row.special_instructions ?? row.pets?.other_notes ?? "",
        }));
        setCareRows(mapped);
        setCareLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, bookingId]);

  const close = () => {
    onOpenChange(false);
    onFinished?.();
  };

  const validateRows = (rows: DraftRow[]) =>
    rows.filter((r) => r.description.trim().length > 0 && r.quantity >= 1);

  const saveItemsCore = async () => {
    const p = validateRows(personal);
    const f = validateRows(food);

    const deleteRemoved = async (drafts: DraftRow[], category: "personal" | "food") => {
      const keep = new Set(drafts.map((d) => d.dbId).filter(Boolean) as string[]);
      const existing = serverItems.filter(
        (i) => i.category === category && i.description !== OVERVIEW_ITEM_DESCRIPTION,
      );
      for (const it of existing) {
        if (!keep.has(it.id)) await deleteItem.mutateAsync({ id: it.id, bookingId });
      }
    };

    await deleteRemoved(p, "personal");
    await deleteRemoved(f, "food");

    const upsertRow = async (row: DraftRow) => {
      if (row.dbId) {
        await updateItem.mutateAsync({
          id: row.dbId,
          description: row.description.trim(),
          quantity: row.quantity,
          condition_notes: row.condition_notes.trim() || null,
          photo_urls: row.photo_urls,
        });
        return row.dbId;
      }
      const created = await createItem.mutateAsync({
        booking_id: bookingId,
        category: row.category,
        description: row.description.trim(),
        quantity: row.quantity,
        condition_notes: row.condition_notes.trim() || null,
        photo_urls: row.photo_urls,
      });
      return created.id;
    };

    for (const row of p) {
      const id = await upsertRow(row);
      row.dbId = id;
    }
    for (const row of f) {
      const id = await upsertRow(row);
      row.dbId = id;
    }

    let overviewId = overviewDbId;
    if (overviewUrls.length > 0) {
      if (overviewId) {
        await updateItem.mutateAsync({
          id: overviewId,
          photo_urls: overviewUrls,
        });
      } else {
        const created = await createItem.mutateAsync({
          booking_id: bookingId,
          category: "personal",
          description: OVERVIEW_ITEM_DESCRIPTION,
          quantity: 1,
          condition_notes: null,
          photo_urls: overviewUrls,
        });
        overviewId = created.id;
        setOverviewDbId(created.id);
      }
    } else if (overviewId) {
      await deleteItem.mutateAsync({ id: overviewId, bookingId });
      setOverviewDbId(undefined);
    }
  };

  const runCheckInAfterSave = async () => {
    const nowIso = new Date().toISOString();
    if (actualCheckInDate !== bookedCheckInDate) {
      await updateBooking.mutateAsync({
        id: bookingId,
        status: "checked_in",
        check_in_date: actualCheckInDate,
        actual_check_in_at: nowIso,
      });
    } else {
      await checkIn.mutateAsync(bookingId);
    }
  };

  const saveCareRows = async () => {
    for (const row of careRows) {
      const { error } = await supabase
        .from("booking_pets")
        .update({
          feeding_notes:
            composeAmPmNotes(row.feeding_am, row.feeding_pm) || null,
          medication_notes:
            composeAmPmNotes(row.medication_am, row.medication_pm) || null,
          special_instructions: row.special_instructions.trim() || null,
        })
        .eq("id", row.id);
      if (error) throw error;
    }
  };

  const handleSaveItemsOnly = async () => {
    setBusy(true);
    try {
      await saveItemsCore();
      await saveCareRows();
      toast.success("Belongings saved");
      close();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAndCheckIn = async () => {
    setBusy(true);
    try {
      await saveItemsCore();
      await saveCareRows();
      await runCheckInAfterSave();
      toast.success("Checked in · belongings saved");
      close();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  };

  const triggerRowPhoto = (rowKey: string) => {
    photoTarget.current = { kind: "row", rowKey };
    photoInputRef.current?.click();
  };

  const onPhotoFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const target = photoTarget.current;
    photoTarget.current = null;
    const list = [...files];
    try {
      if (target?.kind === "overview") {
        const next = [...overviewUrls];
        for (const file of list) {
          const url = await uploadOverviewPhoto(bookingId, file);
          next.push(url);
        }
        setOverviewUrls(next);
        toast.success("Overview photos uploaded");
        return;
      }
      if (target?.kind === "row") {
        const rk = target.rowKey;
        const pushUrlToRow = (url: string) => {
          setPersonal((rs) =>
            rs.map((r) => (r.key === rk ? { ...r, photo_urls: [...r.photo_urls, url] } : r)),
          );
          setFood((rs) =>
            rs.map((r) => (r.key === rk ? { ...r, photo_urls: [...r.photo_urls, url] } : r)),
          );
        };

        const appendUrl = (url: string) => {
          pushUrlToRow(url);
          draftsRef.current = {
            personal: draftsRef.current.personal.map((r) =>
              r.key === rk ? { ...r, photo_urls: [...r.photo_urls, url] } : r,
            ),
            food: draftsRef.current.food.map((r) =>
              r.key === rk ? { ...r, photo_urls: [...r.photo_urls, url] } : r,
            ),
          };
        };

        for (const file of list) {
          const { personal: p, food: fd } = draftsRef.current;
          const row = [...p, ...fd].find((r) => r.key === rk);
          if (!row) break;
          if (row.dbId) {
            const url = await uploadItemPhoto.mutateAsync({
              bookingId,
              itemId: row.dbId,
              file,
            });
            appendUrl(url);
          } else {
            const url = await uploadStaged.mutateAsync({
              bookingId,
              stagedKey: rk,
              file,
            });
            appendUrl(url);
          }
        }
        toast.success("Photos uploaded");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const removeRowPhoto = (rowKey: string, url: string) => {
    setPersonal((rs) =>
      rs.map((r) => (r.key === rowKey ? { ...r, photo_urls: r.photo_urls.filter((u) => u !== url) } : r)),
    );
    setFood((rs) =>
      rs.map((r) => (r.key === rowKey ? { ...r, photo_urls: r.photo_urls.filter((u) => u !== url) } : r)),
    );
  };

  const renderRowEditor = (
    row: DraftRow,
    setRows: React.Dispatch<React.SetStateAction<DraftRow[]>>,
  ) => (
    <div key={row.key} className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-start">
        <Input
          placeholder="e.g. Gray flat bed"
          value={row.description}
          disabled={readOnly}
          onChange={(e) =>
            setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, description: e.target.value } : r)))
          }
          className="flex-1 min-w-[140px]"
        />
        <Input
          type="number"
          min={0}
          className="w-[72px]"
          disabled={readOnly}
          value={row.quantity}
          onChange={(e) =>
            setRows((rs) =>
              rs.map((r) =>
                r.key === row.key ? { ...r, quantity: Math.max(0, parseInt(e.target.value, 10) || 0) } : r,
              ),
            )
          }
        />
        {!readOnly ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => triggerRowPhoto(row.key)}>
              <Camera className="h-4 w-4 mr-1" />
              Photos
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (row.dbId) deleteItem.mutate({ id: row.dbId, bookingId });
                setRows((rs) => rs.filter((r) => r.key !== row.key));
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </div>
      <Input
        placeholder="Condition at arrival"
        value={row.condition_notes}
        disabled={readOnly}
        onChange={(e) =>
          setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, condition_notes: e.target.value } : r)))
        }
      />
      {row.photo_urls.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.photo_urls.map((url) => (
            <div key={url} className="relative">
              <img src={url} alt="" className={THUMB} />
              {!readOnly ? (
                <button
                  type="button"
                  className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1"
                  onClick={() => removeRowPhoto(row.key, url)}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const readOnlyList = (items: BookingItem[], title: string) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None recorded</p>
      ) : (
        items.map((it) => (
          <div key={it.id} className="rounded border p-2 text-sm">
            <p className="font-medium">{it.description}</p>
            <p className="text-muted-foreground">Qty {it.quantity}</p>
            {it.condition_notes ? <p className="text-xs mt-1">{it.condition_notes}</p> : null}
            {it.photo_urls?.length ? (
              <div className="flex gap-1 mt-2">
                {it.photo_urls.map((u) => (
                  <img key={u} src={u} alt="" className={THUMB} />
                ))}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );

  const personalServer = serverItems.filter(
    (i) => i.category === "personal" && i.description !== OVERVIEW_ITEM_DESCRIPTION,
  );
  const foodServer = serverItems.filter((i) => i.category === "food");
  const overviewServer = serverItems.find((i) => i.description === OVERVIEW_ITEM_DESCRIPTION);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-2 shrink-0">
          <SheetTitle>{readOnly ? "Belongings" : "Check-in & belongings"}</SheetTitle>
          <SheetDescription>
            {ownerName} · {petNames} · {roomName}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="space-y-6 pb-6 pr-3">
            {readOnly ? (
              isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  {readOnlyList(personalServer, "Personal belongings")}
                  {readOnlyList(foodServer, "Food & medication")}
                  <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Pet care details</p>
                  {careLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : careRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pet care details found</p>
                  ) : (
                    careRows.map((row) => (
                      <div key={row.id} className="rounded border p-2 text-sm space-y-1.5">
                        <p className="font-medium">{row.petName}</p>
                        <p>
                          <span className="text-muted-foreground">Feeding (AM):</span>{" "}
                          {row.feeding_am || "—"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Feeding (PM):</span>{" "}
                          {row.feeding_pm || "—"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Medication (AM):</span>{" "}
                          {row.medication_am || "—"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Medication (PM):</span>{" "}
                          {row.medication_pm || "—"}
                        </p>
                        <p><span className="text-muted-foreground">Special:</span> {row.special_instructions || "—"}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Overview photos</p>
                    {overviewServer?.photo_urls?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {overviewServer.photo_urls.map((u) => (
                          <img key={u} src={u} alt="" className={THUMB} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">None</p>
                    )}
                  </div>
                </>
              )
            ) : (
              <>
                {checkInInvoice ? (
                  <div
                    className="space-y-3 rounded-lg border p-3"
                    data-testid="checkin-payment-panel"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Payment at check-in</p>
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          (account?.accountBalance ?? 0) >= 0
                            ? "text-emerald-700"
                            : "text-red-700",
                        )}
                      >
                        Account {(account?.accountBalance ?? 0) >= 0 ? "+" : ""}
                        {formatAed(account?.accountBalance ?? 0)}
                      </span>
                    </div>

                    {(account?.outstandingDebt ?? 0) > 0 ? (
                      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-2 text-xs text-amber-900">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                          Owner has {formatAed(account?.outstandingDebt ?? 0)} outstanding
                          across their invoices.
                        </span>
                      </div>
                    ) : null}

                    {checkInInvoice.deposit_bypassed ? (
                      <div className="rounded-md border border-orange-200 bg-orange-50/70 p-2 text-xs text-orange-900">
                        Deposit bypassed
                        {checkInInvoice.deposit_bypass_reason
                          ? ` — ${checkInInvoice.deposit_bypass_reason}`
                          : ""}
                      </div>
                    ) : null}

                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Estimated total</span>
                      <span className="tabular-nums">{formatAed(invoiceGrandTotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Remaining</span>
                      <span className="tabular-nums">{formatAed(invoiceRemaining)}</span>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Staff name</Label>
                      <StaffNameSelect value={payStaff} onChange={setPayStaff} />
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Deposit amount"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        data-testid="checkin-deposit-amount"
                      />
                      <Select
                        value={depositMethod}
                        onValueChange={(v) => setDepositMethod(v as ExternalPaymentMethod)}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WALLET_TOPUP_PAYMENT_METHOD_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={payBusy}
                        onClick={handleDeposit}
                        data-testid="checkin-pay-deposit-btn"
                      >
                        Pay deposit
                      </Button>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      disabled={payBusy || invoiceRemaining <= 0}
                      onClick={() => setPayFullOpen(true)}
                      data-testid="checkin-pay-full-btn"
                    >
                      Pay in full ({formatAed(invoiceRemaining)})
                    </Button>

                    <div className="space-y-1 border-t pt-2">
                      <Label className="text-xs text-muted-foreground">
                        Bypass deposit (reason required)
                      </Label>
                      <Textarea
                        rows={2}
                        placeholder="Reason for bypassing deposit"
                        value={bypassReason}
                        onChange={(e) => setBypassReason(e.target.value)}
                        data-testid="checkin-bypass-reason"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-orange-700"
                        disabled={payBusy}
                        onClick={handleBypass}
                        data-testid="checkin-bypass-btn"
                      >
                        Bypass deposit
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Pet care details</p>
                  <p className="text-xs text-muted-foreground">Prefilled from profile and editable for this booking/check-in.</p>
                  {careLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : careRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pet care details found</p>
                  ) : (
                    <div className="space-y-2">
                      {careRows.map((row) => (
                        <div key={row.id} className="rounded border p-3 space-y-2">
                          <p className="text-sm font-semibold">{row.petName}</p>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Feeding notes</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">AM</Label>
                                <Input
                                  value={row.feeding_am}
                                  onChange={(e) =>
                                    setCareRows((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id
                                          ? { ...r, feeding_am: e.target.value }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">PM</Label>
                                <Input
                                  value={row.feeding_pm}
                                  onChange={(e) =>
                                    setCareRows((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id
                                          ? { ...r, feeding_pm: e.target.value }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Medication notes</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">AM</Label>
                                <Input
                                  value={row.medication_am}
                                  onChange={(e) =>
                                    setCareRows((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id
                                          ? { ...r, medication_am: e.target.value }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">PM</Label>
                                <Input
                                  value={row.medication_pm}
                                  onChange={(e) =>
                                    setCareRows((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id
                                          ? { ...r, medication_pm: e.target.value }
                                          : r,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Special instructions</Label>
                            <Input
                              value={row.special_instructions}
                              onChange={(e) =>
                                setCareRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id ? { ...r, special_instructions: e.target.value } : r,
                                  ),
                                )
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="actual-checkin">Check-in date (if different from booked)</Label>
                  <Input
                    id="actual-checkin"
                    type="date"
                    value={actualCheckInDate}
                    onChange={(e) => setActualCheckInDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Booked {format(parseISO(bookedCheckInDate), "d MMM yyyy")} → check-out{" "}
                    {format(parseISO(bookedCheckOutDate), "d MMM yyyy")}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold">Personal belongings</p>
                      <p className="text-xs text-muted-foreground">Beds, toys, leashes, harnesses, etc.</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setPersonal((p) => [...p, newRow("personal")])}>
                      + Add item
                    </Button>
                  </div>
                  <div className="space-y-2">{personal.map((r) => renderRowEditor(r, setPersonal))}</div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold">Food &amp; medication</p>
                      <p className="text-xs text-muted-foreground">Dry/wet food, supplements, medications</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setFood((p) => [...p, newRow("food")])}>
                      + Add item
                    </Button>
                  </div>
                  <div className="space-y-2">{food.map((r) => renderRowEditor(r, setFood))}</div>
                </div>

                <div
                  className={cn(
                    "rounded-lg border-2 border-dashed p-4 text-center space-y-2",
                    "hover:bg-muted/40 transition-colors",
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    photoTarget.current = { kind: "overview" };
                    onPhotoFiles(e.dataTransfer.files);
                  }}
                >
                  <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Overview photos</p>
                  <p className="text-xs text-muted-foreground">
                    Drop photos here — all belongings together. Or click to upload.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      photoTarget.current = { kind: "overview" };
                      document.getElementById("checkin-overview-input")?.click();
                    }}
                  >
                    Choose files
                  </Button>
                  <input
                    id="checkin-overview-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      photoTarget.current = { kind: "overview" };
                      onPhotoFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  {overviewUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-1 justify-center pt-2">
                      {overviewUrls.map((url) => (
                        <div key={url} className="relative">
                          <img src={url} alt="" className={THUMB} />
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1"
                            onClick={() => setOverviewUrls((u) => u.filter((x) => x !== url))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onPhotoFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="border-t p-4 flex flex-col gap-2 shrink-0">
          {readOnly ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={handleSaveItemsOnly}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save items only
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={handleSaveAndCheckIn}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save &amp; Check In
              </Button>
            </>
          )}
        </div>
      </SheetContent>

      {checkInInvoice && billingOwnerId ? (
        <PaymentSplitDialog
          open={payFullOpen}
          onOpenChange={setPayFullOpen}
          invoiceId={checkInInvoice.id}
          ownerId={billingOwnerId}
          invoiceTotal={invoiceRemaining}
          ensureOutstanding={checkInInvoice.status === "draft"}
          defaultStaffName={payStaff}
          title="Pay in full at check-in"
          onSuccess={() => {
            void refreshBilling();
          }}
        />
      ) : null}
    </Sheet>
  );
}
