/* eslint-disable react-refresh/only-export-components */
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ownerDisplayName } from "@/lib/bookingUtils";
import { roomLabelForBooking } from "@/lib/bookingRoomDisplay";
import { supabase } from "@/integrations/supabase/client";
import {
  PET_CARE_NOTES_SELECT,
  petBehaviourNotes,
  petFeedingNotes,
  petMedicationNotes,
} from "@/lib/petCareNotes";

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
      size: "small" | "medium" | "large" | null;
      date_of_birth: string | null;
      microchip_number: string | null;
      feeding_notes: string | null;
      medication_notes: string | null;
      behaviour_notes: string | null;
      feeding_instructions: string | null;
      medications: string | null;
      medical_conditions: string | null;
      behavioural_notes: string | null;
      other_notes: string | null;
      vet_name: string | null;
      vet_phone: string | null;
    } | null;
  }>;
  booking_items: Array<{
    description: string;
    quantity: number;
    category: string | null;
    condition_notes: string | null;
  }>;
  booking_room_assignments?: Array<{
    start_date: string;
    end_date: string;
    rooms: {
      display_name: string;
      room_number: string;
      cam_id: string | null;
    } | null;
  }>;
};

const OVERVIEW_ITEM_DESCRIPTION = "Overview — belongings (group photo)";

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

const KENNEL_BEHAVIORAL_KEYWORDS = ["aggressive", "reactive", "anxious", "bite"] as const;

function kennelBottomFeedingInstructions(
  primaryCare: KennelCardBooking["booking_pets"][0] | null,
  primaryPet: KennelCardBooking["booking_pets"][0]["pets"],
): string {
  return (
    primaryCare?.feeding_notes?.trim() ||
    petFeedingNotes(primaryPet ?? undefined)
  );
}

function kennelBottomMedicationSpecialCare(
  primaryCare: KennelCardBooking["booking_pets"][0] | null,
  primaryPet: KennelCardBooking["booking_pets"][0]["pets"],
): string {
  const parts = [
    primaryCare?.medication_notes?.trim(),
    petMedicationNotes(primaryPet ?? undefined),
    primaryPet?.medical_conditions?.trim(),
  ].filter(Boolean) as string[];
  return parts.join("\n\n");
}

function kennelBottomBehavioralNotes(primaryPet: KennelCardBooking["booking_pets"][0]["pets"]): {
  text: string;
  flagged: boolean;
} {
  const parts = [
    petBehaviourNotes(primaryPet ?? undefined),
    primaryPet?.other_notes?.trim(),
  ].filter(Boolean) as string[];
  const text = parts.join("\n\n");
  const lower = text.toLowerCase();
  const flagged = KENNEL_BEHAVIORAL_KEYWORDS.some((k) => lower.includes(k));
  return { text, flagged };
}

function KennelCardBottomField({
  label,
  value,
  compact,
  flagged,
  flagCaption,
}: {
  label: string;
  value: string;
  compact?: boolean;
  flagged?: boolean;
  flagCaption?: string;
}) {
  const pad = compact ? "min-h-[4.5rem]" : "min-h-[5.5rem]";
  return (
    <div className={`border border-black ${compact ? "p-1.5" : "p-2"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black pb-1">
        <p className={`print-label font-semibold uppercase ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {label}
        </p>
        {flagged ? (
          <span
            className={`print-keep-color rounded border border-red-600 bg-red-50 px-1.5 py-0.5 font-semibold text-red-800 ${compact ? "text-[9px]" : "text-[10px]"}`}
          >
            {flagCaption ?? "Flag"}
          </span>
        ) : null}
      </div>
      <div
        className={`${pad} whitespace-pre-wrap ${compact ? "mt-1 text-[10px]" : "mt-1.5 text-[11px]"} print-sans`}
      >
        {value.trim() ? value : "\u00a0"}
      </div>
    </div>
  );
}

function stayDates(checkInDate: string, checkOutDate: string): string[] {
  const out: string[] = [];
  try {
    const start = parseISO(checkInDate);
    const end = parseISO(checkOutDate);
    const cursor = new Date(start);
    while (cursor < end && out.length < 14) {
      out.push(format(cursor, "dd MMM"));
      cursor.setDate(cursor.getDate() + 1);
    }
  } catch {
    // Ignore invalid date parsing and fall back to a single row.
  }
  return out.length > 0 ? out : [checkInDate];
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
  const roomLabel = roomLabelForBooking(booking, booking.booking_room_assignments);
  const behaviourFlags = parseFlags(petBehaviourNotes(primaryPet ?? undefined) || null);
  if (owner?.is_vip) behaviourFlags.push("VIP");
  if (booking.do_not_move) behaviourFlags.push("Warning: Do not move");

  const feedingText =
    primaryCare?.feeding_notes?.trim() ||
    petFeedingNotes(primaryPet ?? undefined) ||
    "No feeding notes";
  const medicationText =
    primaryCare?.medication_notes?.trim() ||
    displayMedications(petMedicationNotes(primaryPet ?? undefined) || null);
  const notesText = booking.notes?.trim() || primaryCare?.special_instructions?.trim() || "—";
  const createdAt = format(new Date(booking.created_at), "d MMM yyyy, h:mm a");
  const checklistDates = stayDates(booking.check_in_date, booking.check_out_date).map((day) =>
    compact ? day.replace(" ", "/") : day,
  );
  const ownerItems = (booking.booking_items ?? []).filter(
    (item) => item.description !== OVERVIEW_ITEM_DESCRIPTION,
  );

  const bottomFeeding = kennelBottomFeedingInstructions(primaryCare, primaryPet);
  const bottomMed = kennelBottomMedicationSpecialCare(primaryCare, primaryPet);
  const bottomBeh = kennelBottomBehavioralNotes(primaryPet);

  return (
    <article
      className={`print-page border border-black p-3 ${compact ? "text-[11px]" : "text-[12px]"}`}
    >
      <header className="mb-3 grid grid-cols-[1fr_auto_auto] items-end gap-3 border-b border-black pb-2">
        <div>
          <p className="print-label text-sm font-semibold tracking-wide">woof</p>
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
            {primaryPet?.breed ?? "Unknown breed"} · {primaryPet?.size ? `${primaryPet.size.charAt(0).toUpperCase()}${primaryPet.size.slice(1)}` : "—"} ·{" "}
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

      <section className={`mt-3 border border-black ${compact ? "p-1.5" : "p-2"}`}>
        <p className={`print-label font-semibold uppercase ${compact ? "mb-1 text-[10px]" : "mb-2 text-[11px]"}`}>
          Daily Score Card
        </p>
        <div
          className={`grid gap-[1px] border border-black bg-black ${
            compact
              ? "grid-cols-[60px_repeat(4,1fr)_74px] text-[9px]"
              : "grid-cols-[78px_repeat(4,1fr)_95px] text-[10px]"
          }`}
        >
          <div className={`${compact ? "p-1" : "p-1.5"} bg-white font-semibold`}>Date</div>
          <div className={`${compact ? "p-1" : "p-1.5"} bg-white font-semibold text-center`}>
            {compact ? "AM M" : "AM Meal"}
          </div>
          <div className={`${compact ? "p-1" : "p-1.5"} bg-white font-semibold text-center`}>
            {compact ? "PM M" : "PM Meal"}
          </div>
          <div className={`${compact ? "p-1" : "p-1.5"} bg-white font-semibold text-center`}>
            {compact ? "AM Rx" : "AM Med"}
          </div>
          <div className={`${compact ? "p-1" : "p-1.5"} bg-white font-semibold text-center`}>
            {compact ? "PM Rx" : "PM Med"}
          </div>
          <div className={`${compact ? "p-1" : "p-1.5"} bg-white font-semibold text-center`}>Staff</div>
          {checklistDates.map((day) => (
            <div key={day} className="contents">
              <div className={`bg-white ${compact ? "p-1" : "p-1.5"}`}>{day}</div>
              <div className={`bg-white ${compact ? "p-1" : "p-1.5"} text-center`}>
                <span
                  className={`inline-block border border-black ${compact ? "h-2.5 w-2.5" : "h-3 w-3"}`}
                />
              </div>
              <div className={`bg-white ${compact ? "p-1" : "p-1.5"} text-center`}>
                <span
                  className={`inline-block border border-black ${compact ? "h-2.5 w-2.5" : "h-3 w-3"}`}
                />
              </div>
              <div className={`bg-white ${compact ? "p-1" : "p-1.5"} text-center`}>
                <span
                  className={`inline-block border border-black ${compact ? "h-2.5 w-2.5" : "h-3 w-3"}`}
                />
              </div>
              <div className={`bg-white ${compact ? "p-1" : "p-1.5"} text-center`}>
                <span
                  className={`inline-block border border-black ${compact ? "h-2.5 w-2.5" : "h-3 w-3"}`}
                />
              </div>
              <div className={`bg-white ${compact ? "p-1" : "p-1.5"}`} />
            </div>
          ))}
        </div>
      </section>

      <section className={`mt-3 border border-black ${compact ? "p-1.5" : "p-2"}`}>
        <p className={`print-label font-semibold uppercase ${compact ? "mb-0.5 text-[10px]" : "mb-1 text-[11px]"}`}>
          Items Brought by Owner
        </p>
        {ownerItems.length === 0 ? (
          <p className={compact ? "text-[10px]" : "text-[11px]"}>None listed</p>
        ) : (
          <ul className={`${compact ? "space-y-0.5 text-[10px]" : "space-y-1 text-[11px]"}`}>
            {ownerItems.map((item, idx) => (
              <li
                key={`${item.description}-${idx}`}
                className={`flex justify-between gap-3 border-b border-dashed border-slate-300 ${compact ? "pb-0.5" : "pb-1"}`}
              >
                <span>
                  {item.quantity > 1 ? `${item.quantity} x ` : ""}
                  {item.description}
                  {item.condition_notes ? ` (${item.condition_notes})` : ""}
                </span>
                <span className={`print-sans text-slate-600 ${compact ? "text-[9px]" : "text-[10px]"}`}>
                  {item.category ?? "item"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`mt-3 space-y-2 border border-black ${compact ? "p-1.5" : "p-2"}`}>
        <p
          className={`print-label border-b border-black pb-1 font-semibold uppercase ${compact ? "text-[10px]" : "text-[11px]"}`}
        >
          Feeding &amp; care (staff)
        </p>
        <div className={`grid gap-2 ${compact ? "md:grid-cols-1" : "md:grid-cols-3"} grid-cols-1`}>
          <KennelCardBottomField
            label="Feeding Instructions"
            value={bottomFeeding}
            compact={compact}
          />
          <KennelCardBottomField
            label="Medication / Special Care"
            value={bottomMed}
            compact={compact}
          />
          <KennelCardBottomField
            label="Behavioral Notes"
            value={bottomBeh.text}
            compact={compact}
            flagged={bottomBeh.flagged}
            flagCaption="Review keywords"
          />
        </div>
      </section>

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
      booking_items(description, quantity, category, condition_notes),
      booking_room_assignments(start_date, end_date, rooms(display_name, room_number, cam_id)),
      booking_pets(
        pet_id, feeding_notes, medication_notes, special_instructions,
        pets(
          id, name, photo_url, breed, size, date_of_birth, microchip_number,
          ${PET_CARE_NOTES_SELECT}, medical_conditions, other_notes, vet_name, vet_phone
        )
      )
    `,
    )
    .eq("id", bookingId)
    .single();

  if (error) throw error;
  return data as unknown as KennelCardBooking;
}

export async function fetchKennelCardsAsOf(asOfDate: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      id, booking_ref, booking_type, check_in_date, check_out_date, created_at, notes, do_not_move, staff_id,
      rooms(display_name, room_number, cam_id),
      owners(first_name, last_name, phone, phone2, emergency_contact_phone, is_vip, vet_name, vet_phone),
      booking_items(description, quantity, category, condition_notes),
      booking_room_assignments(start_date, end_date, rooms(display_name, room_number, cam_id)),
      booking_pets(
        pet_id, feeding_notes, medication_notes, special_instructions,
        pets(
          id, name, photo_url, breed, size, date_of_birth, microchip_number,
          ${PET_CARE_NOTES_SELECT}, medical_conditions, other_notes, vet_name, vet_phone
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
  return (data ?? []) as unknown as KennelCardBooking[];
}
