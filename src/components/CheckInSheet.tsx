import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Trash2, Camera, ImagePlus } from "lucide-react";
import { toast } from "sonner";
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
  feeding_notes: string;
  medication_notes: string;
  special_instructions: string;
};

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
      .select("id, feeding_notes, medication_notes, special_instructions, pets(name, feeding_instructions, medications, other_notes)")
      .eq("booking_id", bookingId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setCareRows([]);
          setCareLoading(false);
          return;
        }
        const mapped = (data ?? []).map((row: any) => ({
          id: row.id,
          petName: row.pets?.name ?? "Pet",
          feeding_notes: row.feeding_notes ?? row.pets?.feeding_instructions ?? "",
          medication_notes: row.medication_notes ?? row.pets?.medications ?? "",
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
          feeding_notes: row.feeding_notes.trim() || null,
          medication_notes: row.medication_notes.trim() || null,
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
                        <p><span className="text-muted-foreground">Feeding:</span> {row.feeding_notes || "—"}</p>
                        <p><span className="text-muted-foreground">Medication:</span> {row.medication_notes || "—"}</p>
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
                            <Input
                              value={row.feeding_notes}
                              onChange={(e) =>
                                setCareRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id ? { ...r, feeding_notes: e.target.value } : r,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Medication notes</Label>
                            <Input
                              value={row.medication_notes}
                              onChange={(e) =>
                                setCareRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id ? { ...r, medication_notes: e.target.value } : r,
                                  ),
                                )
                              }
                            />
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
    </Sheet>
  );
}
