import { useState, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format, parse, differenceInYears, differenceInMonths, parseISO } from "date-fns";
import TopBar from "@/components/dashboard/TopBar";
import { usePet, useUpdatePet, useAddVaccination, useDeleteVaccination } from "@/hooks/usePets";
import {
  useGroomingHistory,
  type GroomingAppointmentWithJoins,
} from "@/hooks/useGrooming";
import { usePetBookings, type BookingWithDetails } from "@/hooks/useBookings";
import { usePetParkBookings, type ParkBookingWithJoins } from "@/hooks/usePark";
import { calculateNights, ownerDisplayName } from "@/lib/bookingUtils";
import { boardingCalendarTo, boardingServiceLabel } from "@/lib/boardingLabels";
import { VaccinationEditor } from "@/components/VaccinationEditor";
import { PetDocuments } from "@/components/PetDocuments";
import { VaccicheckPanel } from "@/components/VaccicheckPanel";
import { BookingProfileNotes } from "@/components/BookingProfileNotes";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Pencil,
  Dog,
  Cat,
  Loader2,
  Syringe,
  BookImage,
  BedDouble,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type PetUpdate = Database["public"]["Tables"]["pets"]["Update"];
type AssessmentStatus = Database["public"]["Enums"]["assessment_status"];
type BookingStatus = Database["public"]["Enums"]["booking_status"];
type GroomingService = Database["public"]["Enums"]["grooming_service"];
type ParkSize = Database["public"]["Enums"]["park_size"];

const ASSESSMENT_BADGE: Record<AssessmentStatus, string> = {
  not_assessed: "bg-slate-100 text-slate-600 border-slate-200",
  passed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

const ASSESSMENT_LABEL: Record<AssessmentStatus, string> = {
  not_assessed: "Not Assessed",
  passed: "Passed",
  failed: "Failed",
};

const VAC_STATUS_BADGE: Record<string, string> = {
  valid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  expiring_soon: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-red-100 text-red-700 border-red-200",
};

const VAC_STATUS_LABEL: Record<string, string> = {
  valid: "Valid",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
};

const GROOM_SERVICE_LABEL: Record<GroomingService, string> = {
  full_groom: "Full Groom",
  full_bath: "Full Bath",
  nail_clip: "Nail Clip",
  deshedding: "Deshedding",
  brushing: "Brushing",
  pawdicure: "Pawdicure",
};

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  checked_in: "bg-emerald-100 text-emerald-800 border-emerald-200",
  checked_out: "bg-slate-100 text-slate-600 border-slate-200",
  enquiry: "bg-amber-100 text-amber-800 border-amber-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  no_show: "bg-rose-100 text-rose-700 border-red-200",
};

const TIME_ANCHOR = new Date(2000, 0, 1);

type HistoryServiceFilter = "all" | "boarding" | "grooming" | "park";

function historyFilterEmptyMessage(filter: HistoryServiceFilter): string {
  switch (filter) {
    case "boarding":
      return "No boarding stays in this history.";
    case "grooming":
      return "No grooming appointments in this history.";
    case "park":
      return "No park visits in this history.";
    default:
      return "No bookings yet.";
  }
}

function bookingPetNames(b: BookingWithDetails): string {
  const names = b.booking_pets
    .map((bp) => bp.pets?.name)
    .filter(Boolean) as string[];
  return names.length ? names.join(", ") : "—";
}

function formatBookingStatus(status: BookingStatus): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatGroomSlotTime(t: string | null): string {
  if (!t) return "—";
  try {
    const base = parse(t.slice(0, 8), "HH:mm:ss", TIME_ANCHOR);
    return format(base, "h:mm a");
  } catch {
    return t;
  }
}

function parkLaneLabel(lane: ParkSize): string {
  return lane === "small" ? "Small dog" : "Big dog";
}

function groomerLine(g: GroomingAppointmentWithJoins): string {
  if (g.groomer_name?.trim()) return g.groomer_name.trim();
  if (g.staff) return ownerDisplayName(g.staff.first_name, g.staff.last_name);
  return "—";
}

function groomingStatusLabel(status: string, noShow: boolean): string {
  if (noShow) return "No show";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type BookingDetailSelection =
  | { kind: "stay"; stay: BookingWithDetails }
  | { kind: "grooming"; groom: GroomingAppointmentWithJoins }
  | { kind: "park"; park: ParkBookingWithJoins };

function petAge(dob: string | null): string {
  if (!dob) return "—";
  const birth = parseISO(dob);
  const years = differenceInYears(new Date(), birth);
  if (years >= 1) return `${years} yr${years !== 1 ? "s" : ""}`;
  const months = differenceInMonths(new Date(), birth);
  return `${months} mo${months !== 1 ? "s" : ""}`;
}

const PetProfilePage = () => {
  const { ownerId, petId } = useParams<{ ownerId: string; petId: string }>();
  const navigate = useNavigate();

  const { data: pet, isLoading } = usePet(petId!);
  const { data: petStays = [], isLoading: staysLoading } = usePetBookings(petId ?? "");
  const { data: groomingHistory = [], isLoading: groomingLoading } = useGroomingHistory(
    petId ?? "",
    80,
  );
  const { data: petPark = [], isLoading: parkLoading } = usePetParkBookings(petId ?? "");
  const updatePet = useUpdatePet();
  const addVaccination = useAddVaccination();
  const deleteVaccination = useDeleteVaccination();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<PetUpdate & { id: string }>({ id: petId! });
  const [historyServiceFilter, setHistoryServiceFilter] =
    useState<HistoryServiceFilter>("all");
  const [bookingDetail, setBookingDetail] = useState<BookingDetailSelection | null>(null);

  const bookingTimeline = useMemo(() => {
    type Row =
      | { kind: "stay"; sortKey: string; id: string; stay: BookingWithDetails }
      | { kind: "grooming"; sortKey: string; id: string; groom: GroomingAppointmentWithJoins }
      | { kind: "park"; sortKey: string; id: string; park: ParkBookingWithJoins };

    const rows: Row[] = [];

    petStays.forEach((b) => {
      rows.push({
        kind: "stay",
        sortKey: `${b.check_in_date}T12:00:00`,
        id: b.id,
        stay: b,
      });
    });

    groomingHistory.forEach((g) => {
      const tt = (g.appointment_time || "00:00:00").slice(0, 8);
      rows.push({
        kind: "grooming",
        sortKey: `${g.appointment_date}T${tt}`,
        id: g.id,
        groom: g,
      });
    });

    petPark.forEach((p) => {
      const tt = (p.slot_start || "00:00:00").slice(0, 8);
      rows.push({
        kind: "park",
        sortKey: `${p.visit_date}T${tt}`,
        id: p.id,
        park: p,
      });
    });

    rows.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
    return rows;
  }, [petStays, groomingHistory, petPark]);

  const filteredBookingTimeline = useMemo(() => {
    if (historyServiceFilter === "all") return bookingTimeline;
    return bookingTimeline.filter((row) => {
      switch (historyServiceFilter) {
        case "grooming":
          return row.kind === "grooming";
        case "park":
          return row.kind === "park";
        case "boarding":
          return row.kind === "stay";
        default:
          return true;
      }
    });
  }, [bookingTimeline, historyServiceFilter]);

  const historyLoading = staysLoading || groomingLoading || parkLoading;

  // photo upload
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const openEditDrawer = () => {
    if (!pet) return;
    setEditForm({
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      colour: pet.colour,
      date_of_birth: pet.date_of_birth,
      weight_kg: pet.weight_kg,
      gender: pet.gender,
      spayed_neutered: pet.spayed_neutered,
      microchip_number: pet.microchip_number,
      feeding_instructions: pet.feeding_instructions,
      medical_conditions: pet.medical_conditions,
      medications: pet.medications,
      behavioural_notes: pet.behavioural_notes,
      grooming_notes: pet.grooming_notes,
      other_notes: pet.other_notes,
      vet_name: pet.vet_name,
      vet_phone: pet.vet_phone,
      photo_url: pet.photo_url,
      assessment_status: pet.assessment_status,
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    setEditOpen(true);
  };

  const handleField = (field: keyof PetUpdate, value: unknown) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoSelect = (file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return editForm.photo_url ?? null;
    setPhotoUploading(true);
    const ext = photoFile.name.split(".").pop();
    const path = `${ownerId!}/${petId!}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("pet-photos")
      .upload(path, photoFile, { upsert: true });
    setPhotoUploading(false);
    if (error) {
      toast.error("Photo upload failed: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("pet-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const photoUrl = await uploadPhoto();
    updatePet.mutate({ ...editForm, photo_url: photoUrl }, {
      onSuccess: () => {
        toast.success("Pet updated");
        setEditOpen(false);
        setPhotoFile(null);
        setPhotoPreview(null);
      },
      onError: (err) => toast.error(err.message || "Failed to update pet"),
    });
  };

  // ── loading / not found ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <TopBar title="Pet Profile" />
        <main className="flex-1 overflow-auto p-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </main>
      </>
    );
  }

  if (!pet) {
    return (
      <>
        <TopBar title="Pet Profile" />
        <main className="flex-1 overflow-auto p-8">
          <p className="text-muted-foreground">Pet not found.</p>
        </main>
      </>
    );
  }

  const assessmentStatus = pet.assessment_status as AssessmentStatus;

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar title="Pet Profile" />
      <main className="flex-1 overflow-auto p-8 space-y-8">

        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate(`/customers/${ownerId}`)}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Owner
        </Button>

        {/* ── Pet header card ── */}
        <Card>
          <CardContent className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-5">
                {pet.photo_url ? (
                  <img
                    src={pet.photo_url}
                    alt={pet.name}
                    className="h-24 w-24 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-muted">
                    {pet.species === "cat"
                      ? <Cat className="h-10 w-10 text-muted-foreground" />
                      : <Dog className="h-10 w-10 text-muted-foreground" />}
                  </div>
                )}

                <div className="space-y-1.5">
                  <h2 className="text-2xl font-semibold">{pet.name}</h2>
                  <p className="text-sm text-muted-foreground capitalize">
                    {pet.species}{pet.breed ? ` · ${pet.breed}` : ""}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={ASSESSMENT_BADGE[assessmentStatus]}
                    >
                      {ASSESSMENT_LABEL[assessmentStatus]}
                    </Badge>
                    {pet.spayed_neutered && (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        Spayed / Neutered
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={openEditDrawer}>
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            </div>
            <BookingProfileNotes
              compact
              className="max-w-xl"
              pets={[{ name: pet.name, otherNotes: pet.other_notes }]}
            />
          </CardContent>
        </Card>

        {/* ── Details ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              {[
                { label: "Colour", value: pet.colour },
                { label: "Gender", value: pet.gender ? pet.gender.charAt(0).toUpperCase() + pet.gender.slice(1) : null },
                { label: "Date of birth", value: pet.date_of_birth ? `${format(parseISO(pet.date_of_birth), "d MMM yyyy")} (${petAge(pet.date_of_birth)})` : null },
                { label: "Weight", value: pet.weight_kg != null ? `${pet.weight_kg} kg` : null },
                { label: "Microchip", value: pet.microchip_number },
                { label: "Vet", value: pet.vet_name },
                { label: "Vet phone", value: pet.vet_phone },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-0.5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
                  <p className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</p>
                </div>
              ))}
            </div>

          </CardContent>
        </Card>

        {/* ── Care Notes ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Care Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Feeding instructions", value: pet.feeding_instructions },
              { label: "Medical conditions",   value: pet.medical_conditions },
              { label: "Medications",          value: pet.medications },
              { label: "Behavioural notes",    value: pet.behavioural_notes },
              { label: "Grooming notes",       value: pet.grooming_notes },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-0.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  {label}
                </p>
                {value ? (
                  <p className="text-sm whitespace-pre-line">{value}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Booking history (stays, grooming, park) ── */}
        <section>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BedDouble className="h-5 w-5" />
              Booking History
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={historyServiceFilter === "all" ? "default" : "outline"}
                size="sm"
                aria-pressed={historyServiceFilter === "all"}
                onClick={() => setHistoryServiceFilter("all")}
              >
                All
              </Button>
              <Button
                variant={historyServiceFilter === "boarding" ? "default" : "outline"}
                size="sm"
                aria-pressed={historyServiceFilter === "boarding"}
                onClick={() => setHistoryServiceFilter("boarding")}
              >
                Boarding
              </Button>
              <Button
                variant={historyServiceFilter === "grooming" ? "default" : "outline"}
                size="sm"
                aria-pressed={historyServiceFilter === "grooming"}
                onClick={() => setHistoryServiceFilter("grooming")}
              >
                Grooming
              </Button>
              <Button
                variant={historyServiceFilter === "park" ? "default" : "outline"}
                size="sm"
                aria-pressed={historyServiceFilter === "park"}
                onClick={() => setHistoryServiceFilter("park")}
              >
                Park
              </Button>
            </div>
          </div>

          {historyLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : bookingTimeline.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <BedDouble className="h-7 w-7 mb-2 opacity-60" />
                <p className="text-sm">No bookings yet.</p>
              </CardContent>
            </Card>
          ) : filteredBookingTimeline.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <BedDouble className="h-7 w-7 mb-2 opacity-60" />
                <p className="text-sm">{historyFilterEmptyMessage(historyServiceFilter)}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="whitespace-nowrap">Ref</TableHead>
                    <TableHead className="whitespace-nowrap">Service</TableHead>
                    <TableHead className="min-w-[140px]">Dates</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="min-w-[160px]">Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookingTimeline.map((row) => {
                    if (row.kind === "stay") {
                      const b = row.stay;
                      const nights = calculateNights(b.check_in_date, b.check_out_date);
                      const room = b.rooms;
                      const service =
                        boardingServiceLabel(room?.wing);
                      const roomLine = room?.display_name ?? "—";
                      return (
                        <TableRow
                          key={`stay-${b.id}`}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setBookingDetail({ kind: "stay", stay: b })}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {b.booking_ref ?? b.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{service}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(parseISO(b.check_in_date), "d MMM yyyy")}
                            {" → "}
                            {format(parseISO(b.check_out_date), "d MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={BOOKING_STATUS_BADGE[b.status]}
                            >
                              {formatBookingStatus(b.status)}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="text-sm max-w-[220px] truncate"
                            title={`${bookingPetNames(b)} · ${roomLine} · ${nights}n`}
                          >
                            {bookingPetNames(b)} · {roomLine} · {nights}n
                          </TableCell>
                        </TableRow>
                      );
                    }
                    if (row.kind === "grooming") {
                      const g = row.groom;
                      const dateLine = `${format(parseISO(g.appointment_date), "d MMM yyyy")}${
                        g.appointment_time
                          ? ` · ${formatGroomSlotTime(g.appointment_time)}`
                          : ""
                      }`;
                      return (
                        <TableRow
                          key={`groom-${g.id}`}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setBookingDetail({ kind: "grooming", groom: g })}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {g.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">Grooming</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{dateLine}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {groomingStatusLabel(g.status, g.no_show)}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="text-sm max-w-[220px] truncate"
                            title={`${GROOM_SERVICE_LABEL[g.service]} · ${groomerLine(g)}`}
                          >
                            {GROOM_SERVICE_LABEL[g.service]} · {groomerLine(g)}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const p = row.park;
                    const dateLine = `${format(parseISO(p.visit_date), "d MMM yyyy")} · ${formatGroomSlotTime(p.slot_start)}`;
                    return (
                      <TableRow
                        key={`park-${p.id}`}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setBookingDetail({ kind: "park", park: p })}
                      >
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {p.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">Park</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{dateLine}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {p.is_assessment ? "Assessment" : "Booked"}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="text-sm max-w-[220px] truncate"
                          title={`${p.pets?.name ?? "—"} · ${parkLaneLabel(p.size_lane)}`}
                        >
                          {p.pets?.name ?? "—"} · {parkLaneLabel(p.size_lane)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <VaccicheckPanel pet={pet} />

        {/* ── Vaccinations ── */}
        <section>
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Syringe className="h-5 w-5" />
            Vaccinations
          </h3>

          <VaccinationEditor
            mode="live"
            petId={petId!}
            savedRows={pet.vaccinations}
            isSaving={addVaccination.isPending}
            onAdd={async (row) => {
              await addVaccination.mutateAsync({ ...row, pet_id: petId! });
              toast.success("Vaccination added");
            }}
            onDelete={(id) => {
              deleteVaccination.mutate(
                { id, petId: petId! },
                { onSuccess: () => toast.success("Vaccination removed") }
              );
            }}
          />
        </section>

        {/* ── Passport / Documents ── */}
        <section>
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <BookImage className="h-5 w-5" />
            Passport &amp; Documents
          </h3>
          <PetDocuments petId={petId!} />
        </section>

      </main>

      <Sheet
        open={bookingDetail !== null}
        onOpenChange={(open) => {
          if (!open) setBookingDetail(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {bookingDetail?.kind === "stay" && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {bookingDetail.stay.booking_ref ?? "Stay details"}
                </SheetTitle>
                <SheetDescription>
                  {boardingServiceLabel(bookingDetail.stay.rooms?.wing)} stay.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Badge
                  variant="outline"
                  className={BOOKING_STATUS_BADGE[bookingDetail.stay.status]}
                >
                  {formatBookingStatus(bookingDetail.stay.status)}
                </Badge>
                {bookingDetail.stay.do_not_move && (
                  <Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200">
                    DO NOT MOVE
                  </Badge>
                )}
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Customer</p>
                  {bookingDetail.stay.owners ? (
                    <Link
                      to={`/customers/${bookingDetail.stay.owner_id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      {bookingDetail.stay.owners.first_name}{" "}
                      {bookingDetail.stay.owners.last_name}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <p className="text-sm">—</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Pets</p>
                  <div className="text-sm space-y-1">
                    {bookingDetail.stay.booking_pets.length === 0 ? (
                      <p>—</p>
                    ) : (
                      bookingDetail.stay.booking_pets.map((bp) => (
                        <button
                          key={bp.pet_id}
                          type="button"
                          className="flex items-center gap-1 font-medium text-primary hover:underline"
                          onClick={() =>
                            navigate(`/customers/${ownerId}/pets/${bp.pet_id}`)
                          }
                        >
                          {bp.pets?.name ?? "Pet"}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <BookingProfileNotes
                  pets={bookingDetail.stay.booking_pets.map((bp) => ({
                    name: bp.pets?.name ?? "Pet",
                    otherNotes: bp.pets?.other_notes,
                  }))}
                />
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Room</p>
                  <p className="text-sm">
                    {bookingDetail.stay.rooms?.display_name ?? "—"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Check-in</p>
                    <p className="text-sm">
                      {format(parseISO(bookingDetail.stay.check_in_date), "d MMM yyyy")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Check-out</p>
                    <p className="text-sm">
                      {format(parseISO(bookingDetail.stay.check_out_date), "d MMM yyyy")}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {calculateNights(
                    bookingDetail.stay.check_in_date,
                    bookingDetail.stay.check_out_date,
                  )}{" "}
                  night
                  {calculateNights(
                    bookingDetail.stay.check_in_date,
                    bookingDetail.stay.check_out_date,
                  ) !== 1
                    ? "s"
                    : ""}
                </p>
                {(bookingDetail.stay.pickup_required ||
                  bookingDetail.stay.dropoff_required) && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">
                      Transport
                    </p>
                    <p className="text-sm">
                      {[
                        bookingDetail.stay.pickup_required && "Pickup (check-in)",
                        bookingDetail.stay.dropoff_required && "Drop-off (check-out)",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                )}
                {bookingDetail.stay.notes && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Notes</p>
                    <p className="text-sm whitespace-pre-line">{bookingDetail.stay.notes}</p>
                  </div>
                )}
                <Button variant="outline" className="w-full" asChild>
                  <Link to={boardingCalendarTo(bookingDetail.stay.rooms?.wing)}>
                    Open calendar
                  </Link>
                </Button>
              </div>
            </>
          )}

          {bookingDetail?.kind === "grooming" && (
            <>
              <SheetHeader>
                <SheetTitle>Grooming appointment</SheetTitle>
                <SheetDescription>
                  {format(parseISO(bookingDetail.groom.appointment_date), "EEEE, d MMMM yyyy")}
                  {bookingDetail.groom.appointment_time
                    ? ` · ${formatGroomSlotTime(bookingDetail.groom.appointment_time)}`
                    : ""}
                </SheetDescription>
                <p className="text-xs text-muted-foreground font-mono pt-1">
                  {bookingDetail.groom.id}
                </p>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Badge variant="outline" className="capitalize">
                  {groomingStatusLabel(bookingDetail.groom.status, bookingDetail.groom.no_show)}
                </Badge>
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Service</p>
                  <p className="text-sm font-medium">
                    {GROOM_SERVICE_LABEL[bookingDetail.groom.service]}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Pet</p>
                  {bookingDetail.groom.pet_id === petId ? (
                    <p className="text-sm font-medium">{pet.name}</p>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      onClick={() =>
                        navigate(`/customers/${ownerId}/pets/${bookingDetail.groom.pet_id}`)
                      }
                    >
                      {bookingDetail.groom.pets?.name ?? "—"}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <BookingProfileNotes
                  compact
                  pets={[
                    {
                      name: bookingDetail.groom.pets?.name ?? pet.name,
                      otherNotes: bookingDetail.groom.pets?.other_notes,
                    },
                  ]}
                />
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Groomer</p>
                  <p className="text-sm">{groomerLine(bookingDetail.groom)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Price</p>
                  <p className="text-sm tabular-nums">
                    {bookingDetail.groom.price != null
                      ? `AED ${bookingDetail.groom.price.toFixed(0)}`
                      : "—"}
                  </p>
                </div>
                {bookingDetail.groom.notes && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Notes</p>
                    <p className="text-sm whitespace-pre-line">{bookingDetail.groom.notes}</p>
                  </div>
                )}
                <Button variant="outline" className="w-full" asChild>
                  <Link to={`/grooming?date=${bookingDetail.groom.appointment_date}`}>
                    Open grooming schedule
                  </Link>
                </Button>
              </div>
            </>
          )}

          {bookingDetail?.kind === "park" && (
            <>
              <SheetHeader>
                <SheetTitle>Park visit</SheetTitle>
                <SheetDescription>
                  {format(parseISO(bookingDetail.park.visit_date), "EEEE, d MMMM yyyy")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Time slot</p>
                  <p className="text-sm">{formatGroomSlotTime(bookingDetail.park.slot_start)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Lane</p>
                  <p className="text-sm">{parkLaneLabel(bookingDetail.park.size_lane)}</p>
                </div>
                <Badge variant="outline">
                  {bookingDetail.park.is_assessment ? "Assessment" : "Standard visit"}
                </Badge>
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium">Pet</p>
                  {bookingDetail.park.pet_id === petId ? (
                    <p className="text-sm font-medium">{pet.name}</p>
                  ) : bookingDetail.park.pet_id ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      onClick={() =>
                        navigate(`/customers/${ownerId}/pets/${bookingDetail.park.pet_id}`)
                      }
                    >
                      {bookingDetail.park.pets?.name ?? "—"}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : (
                    <p className="text-sm">—</p>
                  )}
                </div>
                <BookingProfileNotes
                  compact
                  pets={[
                    {
                      name: bookingDetail.park.pets?.name ?? pet.name,
                      otherNotes: bookingDetail.park.pets?.other_notes,
                    },
                  ]}
                />
                {bookingDetail.park.notes && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground font-medium">Notes</p>
                    <p className="text-sm whitespace-pre-line">{bookingDetail.park.notes}</p>
                  </div>
                )}
                <Button variant="outline" className="w-full" asChild>
                  <Link to={`/park?date=${bookingDetail.park.visit_date}`}>
                    Open park schedule
                  </Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ══════════════════════════════════════════
          EDIT PET DRAWER
      ══════════════════════════════════════════ */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Pet</SheetTitle>
            <SheetDescription>Update {pet.name}'s details.</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">

            {/* Photo */}
            <div className="space-y-2">
              <Label>Photo</Label>
              <div className="flex items-center gap-4">
                {(photoPreview ?? editForm.photo_url) ? (
                  <img
                    src={photoPreview ?? editForm.photo_url!}
                    alt="Preview"
                    className="h-16 w-16 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs">
                    No photo
                  </div>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0]); }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                  {editForm.photo_url || photoPreview ? "Change photo" : "Upload photo"}
                </Button>
                {(photoPreview ?? editForm.photo_url) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); handleField("photo_url", ""); }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Basic info */}
            <div className="space-y-2">
              <Label htmlFor="edit_pet_name">Name <span className="text-destructive">*</span></Label>
              <Input id="edit_pet_name" required value={editForm.name ?? ""} onChange={(e) => handleField("name", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_species">Species</Label>
                <Select value={editForm.species ?? "dog"} onValueChange={(v) => handleField("species", v)}>
                  <SelectTrigger id="edit_species"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Dog</SelectItem>
                    <SelectItem value="cat">Cat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_breed">Breed</Label>
                <Input id="edit_breed" value={editForm.breed ?? ""} onChange={(e) => handleField("breed", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_colour">Colour</Label>
                <Input id="edit_colour" value={editForm.colour ?? ""} onChange={(e) => handleField("colour", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_dob">Date of birth</Label>
                <Input id="edit_dob" type="date" value={editForm.date_of_birth ?? ""} onChange={(e) => handleField("date_of_birth", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_weight">Weight (kg)</Label>
                <Input
                  id="edit_weight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={editForm.weight_kg ?? ""}
                  onChange={(e) => handleField("weight_kg", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_gender">Gender</Label>
                <Select value={editForm.gender ?? ""} onValueChange={(v) => handleField("gender", v || null)}>
                  <SelectTrigger id="edit_gender"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_microchip">Microchip number</Label>
                <Input id="edit_microchip" value={editForm.microchip_number ?? ""} onChange={(e) => handleField("microchip_number", e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="edit_spayed" className="cursor-pointer">Spayed / Neutered</Label>
                <Switch id="edit_spayed" checked={editForm.spayed_neutered ?? false} onCheckedChange={(v) => handleField("spayed_neutered", v)} />
              </div>
            </div>

            <Separator />

            {/* Vet */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vet Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_vet_name">Vet name</Label>
                <Input id="edit_vet_name" value={editForm.vet_name ?? ""} onChange={(e) => handleField("vet_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_vet_phone">Vet phone</Label>
                <Input id="edit_vet_phone" type="tel" value={editForm.vet_phone ?? ""} onChange={(e) => handleField("vet_phone", e.target.value)} />
              </div>
            </div>

            <Separator />

            {/* Care notes */}
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Care Notes</p>

            <div className="space-y-2">
              <Label htmlFor="edit_feeding">Feeding instructions</Label>
              <Textarea id="edit_feeding" rows={2} value={editForm.feeding_instructions ?? ""} onChange={(e) => handleField("feeding_instructions", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_medical">Medical conditions</Label>
              <Textarea id="edit_medical" rows={2} value={editForm.medical_conditions ?? ""} onChange={(e) => handleField("medical_conditions", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_meds">Medications</Label>
              <Textarea id="edit_meds" rows={2} value={editForm.medications ?? ""} onChange={(e) => handleField("medications", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_behaviour">Behavioural notes</Label>
              <Textarea id="edit_behaviour" rows={2} value={editForm.behavioural_notes ?? ""} onChange={(e) => handleField("behavioural_notes", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_grooming">Grooming notes</Label>
              <Textarea id="edit_grooming" rows={2} value={editForm.grooming_notes ?? ""} onChange={(e) => handleField("grooming_notes", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_other_notes">Other notes (bookings &amp; appointments)</Label>
              <Textarea id="edit_other_notes" rows={2} value={editForm.other_notes ?? ""} onChange={(e) => handleField("other_notes", e.target.value)} placeholder="Shown on boarding, grooming, park…" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_assessment">Assessment status</Label>
              <Select value={editForm.assessment_status ?? "not_assessed"} onValueChange={(v) => handleField("assessment_status", v)}>
                <SelectTrigger id="edit_assessment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_assessed">Not Assessed</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={updatePet.isPending || photoUploading}>
              {(updatePet.isPending || photoUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {photoUploading ? "Uploading photo…" : "Save Changes"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default PetProfilePage;
