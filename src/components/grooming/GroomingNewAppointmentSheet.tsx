import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { OwnerClientSearch } from "@/components/OwnerClientSearch";
import { GroomingBookingSearch } from "@/components/grooming/GroomingBookingSearch";
import { GroomingPetDraftCard } from "@/components/grooming/GroomingPetDraftCard";
import { GroomingConflictOverrideDialog } from "@/components/grooming/GroomingConflictOverrideDialog";
import { PetSafetyNotesBanner } from "@/components/grooming/PetSafetyNotesBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useOwner } from "@/hooks/useOwners";
import { usePets } from "@/hooks/usePets";
import {
  useCreateGroomingAppointment,
  useLastGroomingDateByPetIds,
  type BookingLinkRow,
} from "@/hooks/useGrooming";
import {
  logGroomingCapacityOverride,
  rpcValidateGroomingAppt,
} from "@/hooks/useGroomingCapacity";
import { useGroomingManualFeeBounds } from "@/hooks/useGroomingManualFeeBounds";
import { ownerDisplayName, createServiceInvoice } from "@/lib/bookingUtils";
import {
  groomingBookingLinkPetIds,
  type GroomingBookingLinkHit,
} from "@/lib/groomingBookingLinkSearch";
import { groomingServiceToPricingKey } from "@/lib/addonPricing";
import {
  buildInsertFromDraft,
  createDefaultPetDraft,
  dogSizeFromPetRecord,
  draftFinalAed,
  draftPrimaryDbService,
  draftServiceLabels,
  type PetGroomingDraft,
} from "@/lib/groomingPetDraft";
import {
  validateGroomingScheduleTime,
  warningsToScheduleConflicts,
  type GroomingScheduleConflict,
} from "@/lib/groomingScheduleUtils";
import type { GroomingStationRow } from "@/hooks/useGroomingStations";
import {
  GROOMING_PAYMENT_METHOD_NONE,
  GROOMING_PAYMENT_METHOD_OPTIONS,
  groomingPaymentMethodLabel,
  parseGroomingPaymentMethodSelectValue,
  type GroomingPaymentMethod,
} from "@/lib/groomingPaymentMethod";
import { parsePetSpecialAlerts, petHasSpecialAlerts } from "@/lib/petAlerts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PET_NOTE_SAFETY_KEYWORDS = [
  "aggressive",
  "reactive",
  "anxious",
  "medical",
  "medication",
  "nervous",
  "bite",
] as const;

function petProfileTextForSafetyScan(pet: {
  grooming_notes?: string | null;
  other_notes?: string | null;
  special_alerts?: unknown;
}): string {
  const parts: string[] = [];
  if (pet.grooming_notes?.trim()) parts.push(pet.grooming_notes.trim());
  if (pet.other_notes?.trim()) parts.push(pet.other_notes.trim());
  if (pet.special_alerts != null) {
    try {
      parts.push(
        typeof pet.special_alerts === "string"
          ? pet.special_alerts
          : JSON.stringify(pet.special_alerts),
      );
    } catch {
      parts.push(String(pet.special_alerts));
    }
  }
  return parts.join("\n\n");
}

function petSafetyKeywordHit(fullText: string): boolean {
  if (!fullText.trim()) return false;
  const lower = fullText.toLowerCase();
  return PET_NOTE_SAFETY_KEYWORDS.some((k) => lower.includes(k));
}

export type GroomingSlotPrefill = {
  stationId: string;
  time: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDay: Date;
  slotPrefill?: GroomingSlotPrefill | null;
  groomingStations: GroomingStationRow[];
};

export function GroomingNewAppointmentSheet({
  open,
  onOpenChange,
  defaultDay,
  slotPrefill,
  groomingStations,
}: Props) {
  const createAppt = useCreateGroomingAppointment();
  const { data: manualFeeBounds } = useGroomingManualFeeBounds(open);

  const mattingDefault =
    manualFeeBounds && manualFeeBounds.mattingMin > 0
      ? String(manualFeeBounds.mattingMin)
      : "";
  const heavyDefault =
    manualFeeBounds && manualFeeBounds.heavyMin > 0 ? String(manualFeeBounds.heavyMin) : "";

  const [walkInMode, setWalkInMode] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<GroomingBookingLinkHit | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PetGroomingDraft>>({});
  const [paymentMethod, setPaymentMethod] = useState<GroomingPaymentMethod | null>(null);
  const [showPreferredGroomerHint, setShowPreferredGroomerHint] = useState(false);
  const lastPrefilledOwnerIdForGroomer = useRef<string | null>(null);
  const slotPrefillAppliedRef = useRef(false);

  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<GroomingScheduleConflict[]>([]);

  const { data: pets = [] } = usePets(ownerId ?? "");
  const { data: ownerForGroomingPref } = useOwner(ownerId ?? "");

  const resetForm = useCallback(() => {
    setWalkInMode(false);
    setSelectedBooking(null);
    setOwnerId(null);
    setOwnerLabel(null);
    setBookingId(null);
    setSelectedPetIds([]);
    setDrafts({});
    setPaymentMethod(null);
    setShowPreferredGroomerHint(false);
    lastPrefilledOwnerIdForGroomer.current = null;
    slotPrefillAppliedRef.current = false;
    setConflictDialogOpen(false);
    setPendingConflicts([]);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || !ownerId) return;
    if (!ownerForGroomingPref || ownerForGroomingPref.id !== ownerId) return;
    if (lastPrefilledOwnerIdForGroomer.current === ownerId) return;
    const pref = ownerForGroomingPref.preferred_groomer?.trim() ?? "";
    if (pref) {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const petId of Object.keys(next)) {
          if (!next[petId].groomerName) {
            next[petId] = { ...next[petId], groomerName: pref };
          }
        }
        return next;
      });
      setShowPreferredGroomerHint(true);
    }
    lastPrefilledOwnerIdForGroomer.current = ownerId;
  }, [open, ownerId, ownerForGroomingPref]);

  const initDraftForPet = useCallback(
    (petId: string, applySlotPrefill: boolean) => {
      const pet = pets.find((p) => p.id === petId);
      const pref = ownerForGroomingPref?.preferred_groomer?.trim() ?? "";
      return createDefaultPetDraft({
        petId,
        defaultDay,
        mattingDefault,
        heavyDefault,
        dogSizeFromPet: pet ? dogSizeFromPetRecord(pet) : null,
        groomerName: pref,
        stationId: applySlotPrefill && slotPrefill ? slotPrefill.stationId : null,
        apptTime: applySlotPrefill && slotPrefill ? slotPrefill.time : undefined,
      });
    },
    [pets, ownerForGroomingPref, defaultDay, mattingDefault, heavyDefault, slotPrefill],
  );

  const ensureDraftsForPets = useCallback(
    (petIds: string[]) => {
      setDrafts((prev) => {
        const next = { ...prev };
        let firstNew = !slotPrefillAppliedRef.current;
        for (const petId of petIds) {
          if (!next[petId]) {
            next[petId] = initDraftForPet(petId, firstNew);
            if (firstNew) {
              slotPrefillAppliedRef.current = true;
              firstNew = false;
            }
          }
        }
        for (const id of Object.keys(next)) {
          if (!petIds.includes(id)) delete next[id];
        }
        return next;
      });
    },
    [initDraftForPet],
  );

  useEffect(() => {
    if (!open || !ownerId) return;
    if (pets.length === 1 && selectedPetIds.length === 0) {
      setSelectedPetIds([pets[0].id]);
    }
  }, [open, ownerId, pets, selectedPetIds.length]);

  useEffect(() => {
    if (!open) return;
    ensureDraftsForPets(selectedPetIds);
  }, [open, selectedPetIds, ensureDraftsForPets]);

  const handleBookingSelect = (hit: BookingLinkRow) => {
    setSelectedBooking(hit);
    setBookingId(hit.id);
    setWalkInMode(false);
    setOwnerId(hit.owner_id);
    const ownerName = hit.owners
      ? ownerDisplayName(hit.owners.first_name, hit.owners.last_name)
      : "Owner";
    setOwnerLabel(ownerName);
    slotPrefillAppliedRef.current = false;
    const petIds = groomingBookingLinkPetIds(hit);
    setSelectedPetIds(petIds);
    setDrafts({});
  };

  const handleBookingClear = () => {
    setSelectedBooking(null);
    setBookingId(null);
    setOwnerId(null);
    setOwnerLabel(null);
    setSelectedPetIds([]);
    setDrafts({});
    slotPrefillAppliedRef.current = false;
  };

  const togglePetSelected = (id: string) => {
    setSelectedPetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const updateDraft = useCallback((petId: string, patch: Partial<PetGroomingDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [petId]: { ...prev[petId], ...patch },
    }));
    if (patch.groomerName !== undefined) {
      setShowPreferredGroomerHint(false);
    }
  }, []);

  const selectedPetsOrdered = useMemo(
    () => pets.filter((p) => selectedPetIds.includes(p.id)),
    [pets, selectedPetIds],
  );

  const petIdsForLastGroom = selectedPetIds;
  const { data: lastGroomDateByPet } = useLastGroomingDateByPetIds(petIdsForLastGroom, {
    enabled: open && petIdsForLastGroom.length > 0,
  });
  const lastGroomMap = lastGroomDateByPet ?? new Map<string, string>();

  const petsForSafetyScan = useMemo(() => {
    if (selectedPetsOrdered.length > 0) return selectedPetsOrdered;
    if (ownerId && pets.length === 1) return pets;
    return [];
  }, [selectedPetsOrdered, ownerId, pets]);

  const isComplimentaryPayment = paymentMethod === "complimentary";

  const performCreate = async (overrideReason?: string) => {
    if (createAppt.isPending) return;
    if (!ownerId) {
      toast.error("Select an owner or booking.");
      return;
    }
    if (selectedPetIds.length === 0) {
      toast.error(
        pets.length > 1 ? "Select at least one pet." : "No pet available for this owner.",
      );
      return;
    }

    const warningsByPet: { petId: string; warnings: { code: string; msg: string }[] }[] = [];
    for (const petId of selectedPetIds) {
      const draft = drafts[petId];
      if (!draft) {
        toast.error("Appointment details missing for a selected pet.");
        return;
      }
      const scheduleErr = validateGroomingScheduleTime(draft.apptTime, draft.durationMin);
      if (scheduleErr) {
        toast.error(scheduleErr);
        return;
      }
      const validation = await rpcValidateGroomingAppt({
        date: format(draft.appointmentDate, "yyyy-MM-dd"),
        stationId: draft.stationId,
        start: `${draft.apptTime}:00`,
        duration: draft.durationMin,
      });
      if (!validation.ok && (validation.warnings?.length ?? 0) > 0) {
        warningsByPet.push({ petId, warnings: validation.warnings });
      }
    }

    const allWarnings = warningsByPet.flatMap((c) => c.warnings);
    if (allWarnings.length > 0 && !overrideReason) {
      setPendingConflicts(warningsToScheduleConflicts(allWarnings));
      setConflictDialogOpen(true);
      return;
    }

    const inserts: ReturnType<typeof buildInsertFromDraft>[] = [];
    for (const petId of selectedPetIds) {
      const draft = drafts[petId];
      const payload = buildInsertFromDraft({
        draft,
        ownerId,
        bookingId,
        paymentMethod,
        manualFeeBounds,
        isComplimentary: isComplimentaryPayment,
      });
      if ("error" in payload) {
        const petName = pets.find((p) => p.id === petId)?.name ?? "Pet";
        toast.error(`${petName}: ${payload.error}`);
        return;
      }
      inserts.push(payload);
    }

    try {
      const createdRows = [];
      const consumedCreditByPet: Record<string, { package_name: string }> = {};
      const warningsMap = new Map(
        warningsByPet.map((c) => [c.petId, c.warnings] as const),
      );

      for (let i = 0; i < selectedPetIds.length; i++) {
        const petId = selectedPetIds[i];
        const insert = inserts[i];
        if (!insert || "error" in insert) continue;

        const appt = await createAppt.mutateAsync(insert);
        createdRows.push(appt);

        const draft = drafts[petId];
        const petWarnings = warningsMap.get(petId) ?? [];
        if (overrideReason && petWarnings.length > 0 && draft) {
          await logGroomingCapacityOverride({
            appointmentId: appt.id,
            jobDate: format(draft.appointmentDate, "yyyy-MM-dd"),
            warnings: petWarnings,
            reason: overrideReason,
          });
        }

        const useCredit = draft?.useCredit;
        if (useCredit) {
          const primaryService = draft ? draftPrimaryDbService(draft) : null;
          const serviceCode = primaryService
            ? (groomingServiceToPricingKey(primaryService) as
                | Database["public"]["Enums"]["service_code"]
                | undefined)
            : null;
          if (serviceCode) {
            const { data: credits, error: creditListErr } = await supabase.rpc(
              "list_active_credits_for_pet",
              {
                p_pet_id: petId,
                p_service_code: serviceCode,
              },
            );
            if (creditListErr) throw creditListErr;
            const credit = (credits ?? [])[0] as
              | { credit_id: string; package_name: string }
              | undefined;
            if (credit) {
              const { error } = await supabase.rpc("consume_service_credit", {
                p_credit_id: credit.credit_id,
                p_units: 1,
                p_consumed_for_ref_id: appt.id,
                p_consumed_for_ref_type: "grooming_appointment",
              });
              if (error) throw error;
              consumedCreditByPet[petId] = {
                package_name: credit.package_name ?? "package credit",
              };
            }
          }
        }
      }

      toast.success(
        createdRows.length === 1
          ? "Appointment created."
          : `${createdRows.length} appointments created.`,
      );
      onOpenChange(false);
      setConflictDialogOpen(false);

      createServiceInvoice({
        ownerId,
        serviceType: "grooming",
        referenceId: createdRows[0].id,
        checkInDate: format(createdRows[0].appointment_date, "yyyy-MM-dd"),
        notes: paymentMethod
          ? `Payment method: ${groomingPaymentMethodLabel(paymentMethod)}`
          : undefined,
        lineItems: createdRows.map((appt) => {
          const draft = drafts[appt.pet_id];
          const petName = pets.find((p) => p.id === appt.pet_id)?.name ?? "Pet";
          const svcLabel = draft
            ? draftServiceLabels(draft, manualFeeBounds)
            : "Grooming";
          const linePrice = consumedCreditByPet[appt.pet_id]
            ? 0
            : draft
              ? (draftFinalAed(draft.price, draft.discountPct, isComplimentaryPayment) ?? 0)
              : (appt.price ?? 0);
          const consumed = consumedCreditByPet[appt.pet_id];
          const apptDate = draft?.appointmentDate ?? defaultDay;
          return {
            description: consumed
              ? `${svcLabel} — ${petName} — ${format(apptDate, "d MMM yyyy")} (covered by ${consumed.package_name})`
              : `${svcLabel} — ${petName} — ${format(apptDate, "d MMM yyyy")}`,
            quantity: 1,
            unitPrice: linePrice,
            serviceType: "grooming" as const,
            preserveUnitPrice: true,
          };
        }),
      })
        .then(() => toast.success("Draft invoice created"))
        .catch((err) => console.error("Auto-invoice failed:", err));
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: string }).message)
            : "Could not create.";
      toast.error(msg);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New appointment</SheetTitle>
            <SheetDescription>
              Find a boarding booking or add a walk-in, then set details per pet.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Find booking
              </h3>
              {!walkInMode ? (
                <>
                  <GroomingBookingSearch
                    selectedHit={selectedBooking}
                    onSelect={handleBookingSelect}
                    onClear={handleBookingClear}
                  />
                  <button
                    type="button"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                    data-testid="grooming-walk-in-link"
                    onClick={() => {
                      setWalkInMode(true);
                      setSelectedBooking(null);
                      setBookingId(null);
                    }}
                  >
                    Walk-in — no booking
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => setWalkInMode(false)}
                  >
                    ← Back to booking search
                  </button>
                  <div className="space-y-2">
                    <Label>Owner</Label>
                    <OwnerClientSearch
                      selectedId={ownerId}
                      selectedLabel={ownerLabel}
                      onSelect={(id, label) => {
                        setOwnerId(id);
                        setOwnerLabel(label);
                        setSelectedPetIds([]);
                        setDrafts({});
                        slotPrefillAppliedRef.current = false;
                        lastPrefilledOwnerIdForGroomer.current = null;
                      }}
                      onClear={() => {
                        setOwnerId(null);
                        setOwnerLabel(null);
                        setSelectedPetIds([]);
                        setDrafts({});
                      }}
                    />
                  </div>
                </>
              )}
            </section>

            {(ownerId || selectedBooking) && (
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Pets
                </h3>
                {ownerId && pets.length === 0 && (
                  <p className="text-sm text-muted-foreground">Loading pets…</p>
                )}
                {pets.length > 1 && (
                  <div className="rounded-lg border divide-y max-h-52 overflow-y-auto">
                    {pets.map((p) => (
                      <label
                        key={p.id}
                        htmlFor={`groom-new-pet-${p.id}`}
                        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`groom-new-pet-${p.id}`}
                          checked={selectedPetIds.includes(p.id)}
                          onCheckedChange={() => togglePetSelected(p.id)}
                        />
                        <span className="text-sm font-medium flex-1 min-w-0">{p.name}</span>
                        {petHasSpecialAlerts(parsePetSpecialAlerts(p.special_alerts)) ? (
                          <Badge
                            variant="outline"
                            className="border-orange-400 bg-orange-50 text-orange-900 text-[10px] shrink-0"
                          >
                            Alert
                          </Badge>
                        ) : null}
                      </label>
                    ))}
                  </div>
                )}
                {petsForSafetyScan.map((pet) => {
                  const scan = petProfileTextForSafetyScan(pet);
                  if (!petSafetyKeywordHit(scan)) return null;
                  return (
                    <PetSafetyNotesBanner
                      key={`kw-safety-${pet.id}`}
                      petLabel={pets.length > 1 ? pet.name : undefined}
                      notesText={scan}
                    />
                  );
                })}
              </section>
            )}

            {selectedPetsOrdered.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Appointment details (per pet)
                </h3>
                <Accordion
                  type="multiple"
                  defaultValue={selectedPetsOrdered.map((p) => p.id)}
                  className="space-y-2"
                >
                  {selectedPetsOrdered.map((pet) => {
                    const draft = drafts[pet.id];
                    if (!draft) return null;
                    return (
                      <AccordionItem key={pet.id} value={pet.id} className="rounded-lg border px-3">
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <span className="font-medium">{pet.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground font-normal">
                            {draft.apptTime} ·{" "}
                            {groomingStations.find((s) => s.id === draft.stationId)?.name ??
                              "Unassigned"}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <GroomingPetDraftCard
                            pet={pet}
                            draft={draft}
                            onChange={(patch) => updateDraft(pet.id, patch)}
                            groomingStations={groomingStations}
                            manualFeeBounds={manualFeeBounds}
                            mattingDefault={mattingDefault}
                            heavyDefault={heavyDefault}
                            lastGroomDate={lastGroomMap.get(pet.id)}
                            showPreferredGroomerHint={showPreferredGroomerHint}
                            isComplimentary={isComplimentaryPayment}
                            enabled={open}
                            showPetHeader={false}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </section>
            )}

            {selectedPetsOrdered.length > 0 && (
              <section className="space-y-2">
                <Label>Payment method (optional)</Label>
                <Select
                  value={paymentMethod ?? GROOMING_PAYMENT_METHOD_NONE}
                  onValueChange={(v) =>
                    setPaymentMethod(parseGroomingPaymentMethodSelectValue(v))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GROOMING_PAYMENT_METHOD_NONE}>Not specified</SelectItem>
                    {GROOMING_PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isComplimentaryPayment ? (
                  <p className="text-sm font-medium text-emerald-700">
                    This service is complimentary
                  </p>
                ) : null}
              </section>
            )}
          </div>

          <SheetFooter className="mt-8 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="grooming-save-appointment-btn"
              onClick={() => void performCreate()}
              disabled={createAppt.isPending || selectedPetIds.length === 0}
            >
              {createAppt.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save appointment
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <GroomingConflictOverrideDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        conflicts={pendingConflicts}
        isPending={createAppt.isPending}
        onConfirm={(reason) => void performCreate(reason)}
      />
    </>
  );
}
