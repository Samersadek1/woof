import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { supabase } from "@/integrations/supabase/client";

export type KennelCardBooking = {
  id: string;
  booking_ref: string | null;
  booking_type: string | null;
  check_in_date: string;
  check_out_date: string;
  created_at: string;
  notes: string | null;
  do_not_move: boolean;
  staff_id: string | null;
  rooms: {
    display_name: string;
    room_number: string;
    cam_id: string | null;
  } | null;
  owners: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    phone2: string | null;
    emergency_contact_phone: string | null;
    is_vip: boolean;
    vet_name: string | null;
    vet_phone: string | null;
  } | null;
  booking_pets: Array<{
    pet_id: string;
    feeding_notes: string | null;
    medication_notes: string | null;
    special_instructions: string | null;
    pets: {
      id: string;
      name: string;
      photo_url: string | null;
      breed: string | null;
      size_category: "S" | "M" | "L" | "XL" | null;
      date_of_birth: string | null;
      microchip_number: string | null;
      feeding_instructions: string | null;
      medications: string | null;
      behavioural_notes: string | null;
      vet_name: string | null;
      vet_phone: string | null;
    } | null;
  }>;
};

function parseFlags(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .split(/[,;\n]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function ageFromDob(dob: string | null): string {
  if (!dob) return "Age unknown";
  try {
    return formatDistanceToNowStrict(parseISO(dob), { addSuffix: false });
  } catch {
    return dob;
  }
}

function displayMedications(raw: string | null): string {
  if (!raw?.trim()) return "None listed";
  return raw.trim();
}

function flagTone(flag: string): string {
  const t = flag.toLowerCase();
  if (t.includes("danger") || t.includes("aggressive")) {
    return "border-red-400 text-red-700 bg-red-50";
  }
  if (t.includes("warning") || t.includes("reactive") || t.includes("nervous")) {
    return "border-amber-400 text-amber-800 bg-amber-50";
  }
  if (t.includes("vip")) {
    return "border-blue-400 text-blue-700 bg-blue-50";
  }
  return "border-slate-300 text-slate-700 bg-white";
}

export function kennelCardImageUrls(booking: KennelCardBooking): string[] {
  return booking.booking_pets
    .map((bp) => bp.pets?.photo_url ?? "")
    .filter((url) => url.length > 0);
}

export function KennelCardBlock({
  booking,
  compact = false,
}: {
  booking: KennelCardBooking;
  compact?: boolean;
}) {
  const primaryPet = booking.booking_pets[0]?.pets ?? null;
  const primaryCare = booking.booking_pets[0] ?? null;
  const owner = booking.owners;
  const roomLabel = booking.rooms?.display_name || booking.rooms?.room_number || "Unassigned";
  const behaviourFlags = parseFlags(primaryPet?.behavioural_notes);
  if (owner?.is_vip) behaviourFlags.push("VIP");
  if (booking.do_not_move) behaviourFlags.push("Warning: Do not move");

  const feedingText =
    primaryCare?.feeding_notes?.trim() ||
    primaryPet?.feeding_instructions?.trim() ||
    "No feeding notes";
  const medicationText =
    primaryCare?.medication_notes?.trim() ||
    displayMedications(primaryPet?.medications ?? null);
  const notesText = booking.notes?.trim() || primaryCare?.special_instructions?.trim() || "—";
  const createdAt = format(new Date(booking.created_at), "d MMM yyyy, h:mm a");

  return (
    <article
      className={`print-page border border-black p-3 ${compact ? "text-[11px]" : "text-[12px]"}`}
    >
      <header className="mb-3 grid grid-cols-[1fr_auto_auto] items-end gap-3 border-b border-black pb-2">
        <div>
          <p className="print-label text-sm font-semibold tracking-wide">MSH</p>
          <p className="text-[11px]">Kennel Card</p>
        </div>
        <div className="print-label text-center text-2xl font-bold">{roomLabel}</div>
        <div className="print-label text-right text-xs">
          <p>In: {format(parseISO(booking.check_in_date), "d MMM yyyy")}</p>
          <p>Out: {format(parseISO(booking.check_out_date), "d MMM yyyy")}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <section className="space-y-2 border border-black p-2">
          {primaryPet?.photo_url ? (
            <img
              src={primaryPet.photo_url}
              alt={primaryPet.name}
              width={300}
              height={300}
              loading="eager"
              className="h-[180px] w-full object-cover border border-black"
            />
          ) : (
            <div className="flex h-[180px] w-full items-center justify-center border border-black text-xs">
              No pet photo
            </div>
          )}
          <h2 className="text-xl font-bold">{primaryPet?.name ?? "Unknown pet"}</h2>
          <p>
            {primaryPet?.breed ?? "Unknown breed"} · {primaryPet?.size_category ?? "—"} ·{" "}
            {ageFromDob(primaryPet?.date_of_birth ?? null)}
          </p>
          <p>Microchip: {primaryPet?.microchip_number ?? "—"}</p>
          <div className="flex flex-wrap gap-1">
            {behaviourFlags.length === 0 ? (
              <Badge variant="outline" className="print-keep-color border-slate-300">
                No flags
              </Badge>
            ) : (
              behaviourFlags.map((flag) => (
                <Badge
                  key={flag}
                  variant="outline"
                  className={`print-keep-color ${flagTone(flag)}`}
                >
                  {flag}
                </Badge>
              ))
            )}
          </div>
        </section>

        <section className="space-y-2 border border-black p-2">
          <div>
            <p className="print-label text-[11px] font-semibold uppercase">Owner</p>
            <p>{ownerDisplayName(owner?.first_name, owner?.last_name)}</p>
            <p>{owner?.phone ?? "No primary phone"}</p>
            <p>Emergency: {owner?.emergency_contact_phone ?? owner?.phone2 ?? "—"}</p>
          </div>
          <div>
            <p className="print-label text-[11px] font-semibold uppercase">Vet</p>
            <p>{primaryPet?.vet_name ?? owner?.vet_name ?? "Not listed"}</p>
            <p>{primaryPet?.vet_phone ?? owner?.vet_phone ?? "—"}</p>
          </div>
          <div>
            <p className="print-label text-[11px] font-semibold uppercase">Feeding</p>
            <p className="whitespace-pre-line">{feedingText}</p>
          </div>
          <div>
            <p className="print-label text-[11px] font-semibold uppercase">Medications</p>
            <p className="whitespace-pre-line">{medicationText}</p>
          </div>
          <div>
            <p className="print-label text-[11px] font-semibold uppercase">Special Notes</p>
            <p className="whitespace-pre-line">{notesText}</p>
          </div>
          {booking.rooms?.cam_id ? (
            <p className="print-sans text-xs font-medium">DMSS Room ID: {booking.rooms.cam_id}</p>
          ) : null}
        </section>
      </div>

      <footer className="mt-3 border-t border-black pt-2 print-sans text-[11px]">
        <div className="flex flex-wrap justify-between gap-2">
          <p>Ref: {booking.booking_ref ?? booking.id.slice(0, 8)}</p>
          <p>Checked in by: {booking.staff_id ?? "—"}</p>
          <p>Generated {createdAt}</p>
        </div>
      </footer>
    </article>
  );
}

export async function fetchKennelCardData(bookingId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      id, booking_ref, booking_type, check_in_date, check_out_date, created_at, notes, do_not_move, staff_id,
      rooms(display_name, room_number, cam_id),
      owners(first_name, last_name, phone, phone2, emergency_contact_phone, is_vip, vet_name, vet_phone),
      booking_pets(
        pet_id, feeding_notes, medication_notes, special_instructions,
        pets(
          id, name, photo_url, breed, size_category, date_of_birth, microchip_number,
          feeding_instructions, medications, behavioural_notes, vet_name, vet_phone
        )
      )
    `,
    )
    .eq("id", bookingId)
    .single();

  if (error) throw error;
  return data as KennelCardBooking;
}

export async function fetchKennelCardsAsOf(asOfDate: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      id, booking_ref, booking_type, check_in_date, check_out_date, created_at, notes, do_not_move, staff_id,
      rooms(display_name, room_number, cam_id),
      owners(first_name, last_name, phone, phone2, emergency_contact_phone, is_vip, vet_name, vet_phone),
      booking_pets(
        pet_id, feeding_notes, medication_notes, special_instructions,
        pets(
          id, name, photo_url, breed, size_category, date_of_birth, microchip_number,
          feeding_instructions, medications, behavioural_notes, vet_name, vet_phone
        )
      )
    `,
    )
    .eq("booking_type", "boarding")
    .lte("check_in_date", asOfDate)
    .gt("check_out_date", asOfDate)
    .neq("status", "cancelled")
    .order("check_in_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as KennelCardBooking[];
}
