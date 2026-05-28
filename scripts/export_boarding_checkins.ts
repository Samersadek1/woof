/**
 * Export all boarding bookings (one row per pet) with check-in/out dates and client/pet IDs.
 *
 * Usage (from repo root, requires .env with VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/export_boarding_checkins.ts
 *   npx tsx scripts/export_boarding_checkins.ts exports/boarding-checkins-2026-05-27.xlsx
 */
import { config as loadEnv } from "dotenv";
import { format } from "date-fns";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

loadEnv();

type OwnerRow = { id: string; first_name: string; last_name: string | null };
type PetRow = { id: string; name: string };
type BookingPetRow = { pet_id: string; pets: PetRow | PetRow[] | null };
type BookingRow = {
  id: string;
  booking_ref: string | null;
  status: string;
  check_in_date: string;
  check_out_date: string;
  actual_check_in_at: string | null;
  actual_check_out_at: string | null;
  owner_id: string;
  owners: OwnerRow | OwnerRow[] | null;
  booking_pets: BookingPetRow[] | null;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function ownerName(owner: OwnerRow | null): string {
  if (!owner) return "";
  return [owner.first_name, owner.last_name].filter(Boolean).join(" ").trim();
}

function formatCheckInStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(new Date(iso), "yyyy-MM-dd HH:mm");
  } catch {
    return iso;
  }
}

function exportRows(bookings: BookingRow[]) {
  const rows: Record<string, string | number>[] = [];

  for (const b of bookings) {
    const owner = unwrapOne(b.owners);
    const pets = b.booking_pets ?? [];
    const base = {
      "Booking ref": b.booking_ref ?? "",
      "Check-in status": formatCheckInStatus(b.status),
      "Status code": b.status,
      "Check-in date": b.check_in_date,
      "Check-out date": b.check_out_date,
      "Actual check-in": formatTs(b.actual_check_in_at),
      "Actual check-out": formatTs(b.actual_check_out_at),
      "Client name": ownerName(owner),
      "Client ID": owner?.id ?? b.owner_id,
      "Booking ID": b.id,
    };

    if (pets.length === 0) {
      rows.push({
        ...base,
        "Pet name": "",
        "Pet ID": "",
      });
      continue;
    }

    for (const bp of pets) {
      const pet = unwrapOne(bp.pets);
      rows.push({
        ...base,
        "Pet name": pet?.name ?? "",
        "Pet ID": pet?.id ?? bp.pet_id,
      });
    }
  }

  return rows;
}

async function main() {
  const supabaseUrl = requireEnv("VITE_SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      booking_ref,
      status,
      check_in_date,
      check_out_date,
      actual_check_in_at,
      actual_check_out_at,
      owner_id,
      owners ( id, first_name, last_name ),
      booking_pets ( pet_id, pets ( id, name ) )
    `,
    )
    .eq("booking_type", "boarding")
    .order("check_in_date", { ascending: false })
    .order("booking_ref", { ascending: true });

  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  const bookings = (data ?? []) as BookingRow[];
  const rows = exportRows(bookings);

  const defaultName = `boarding-checkins-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  const outArg = process.argv[2];
  const outPath = outArg
    ? path.isAbsolute(outArg)
      ? outArg
      : path.join(process.cwd(), outArg)
    : path.join(process.cwd(), "exports", defaultName);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Boarding");
  XLSX.writeFile(wb, outPath);

  console.log(`Wrote ${rows.length} rows (${bookings.length} bookings) → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
