import { performance } from "node:perf_hooks";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

type LegacyRoomRow = {
  source_external_id: string;
  name: string;
  is_active: boolean;
};

type LegacyOwnerRow = {
  source_external_id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_elite: boolean;
};

type LegacyPetRow = {
  source_external_id: string;
  owner_source_external_id: string;
  name: string;
  status: string;
  species: string;
  behaviour_notes: string | null;
  feeding_notes: string | null;
  medication_notes: string | null;
};

type LegacyBookingRow = {
  source_external_id: string;
  owner_source_external_id: string;
  check_in_date: string;
  check_out_date: string;
  notes: string | null;
};

type LegacyBookingPetRow = {
  booking_source_external_id: string;
  pet_source_external_id: string;
};

type LegacyBookingRoomAssignmentRow = {
  booking_source_external_id: string;
  room_source_external_id: string;
  start_date: string;
  end_date: string;
};

type ImportPayload = {
  rooms_batches: LegacyRoomRow[][];
  owners_batches: LegacyOwnerRow[][];
  pets_batches: LegacyPetRow[][];
  bookings_batches: LegacyBookingRow[][];
  booking_pets_batches: LegacyBookingPetRow[][];
  booking_room_assignments_batches: LegacyBookingRoomAssignmentRow[][];
};

type ImportCounts = {
  rooms: number;
  owners: number;
  pets: number;
  bookings: number;
  bookingPets: number;
  bookingRoomAssignments: number;
};

const EXPECTED_COUNTS: ImportCounts = {
  rooms: 97,
  owners: 1135,
  pets: 1468,
  bookings: 257,
  bookingPets: 311,
  bookingRoomAssignments: 1123,
};

const BATCH_SIZE = 200;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toRequiredString(value: unknown, field: string): string {
  const text = toNullableString(value);
  if (!text) throw new Error(`Missing required value for field "${field}"`);
  return text;
}

function toBoolean(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

function readCsvRows(filePath: string): Array<Record<string, unknown>> {
  const workbook = XLSX.readFile(filePath, {
    raw: false,
    cellDates: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`No sheet found in ${filePath}`);
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: null,
  });
}

function chunk<T>(rows: T[], batchSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    out.push(rows.slice(i, i + batchSize));
  }
  return out;
}

export function loadLegacyRows(stagingDir: string): {
  rooms: LegacyRoomRow[];
  owners: LegacyOwnerRow[];
  pets: LegacyPetRow[];
  bookings: LegacyBookingRow[];
  bookingPets: LegacyBookingPetRow[];
  bookingRoomAssignments: LegacyBookingRoomAssignmentRow[];
} {
  const roomsRaw = readCsvRows(path.join(stagingDir, "clean_rooms.csv"));
  const ownersRaw = readCsvRows(path.join(stagingDir, "clean_owners.csv"));
  const petsRaw = readCsvRows(path.join(stagingDir, "clean_pets.csv"));
  const bookingsRaw = readCsvRows(path.join(stagingDir, "clean_bookings.csv"));
  const bookingPetsRaw = readCsvRows(path.join(stagingDir, "clean_booking_pets.csv"));
  const bookingRoomAssignmentsRaw = readCsvRows(
    path.join(stagingDir, "clean_booking_room_assignments.csv"),
  );

  const rooms = roomsRaw.map((row) => ({
    source_external_id: toRequiredString(row.source_external_id, "rooms.source_external_id"),
    name: toRequiredString(row.name, "rooms.name"),
    is_active: toBoolean(row.is_active),
  }));

  const owners = ownersRaw.map((row) => ({
    source_external_id: toRequiredString(row.source_external_id, "owners.source_external_id"),
    first_name: toRequiredString(row.first_name, "owners.first_name"),
    last_name: toNullableString(row.last_name),
    phone: toNullableString(row.phone),
    email: toNullableString(row.email),
    notes: toNullableString(row.notes),
    is_elite: toBoolean(row.is_elite),
  }));

  const pets = petsRaw.map((row) => ({
    source_external_id: toRequiredString(row.source_external_id, "pets.source_external_id"),
    owner_source_external_id: toRequiredString(
      row.owner_source_external_id,
      "pets.owner_source_external_id",
    ),
    name: toRequiredString(row.name, "pets.name"),
    status: toRequiredString(row.status, "pets.status").toLowerCase(),
    species: toRequiredString(row.species, "pets.species").toLowerCase(),
    behaviour_notes: toNullableString(row.behaviour_notes),
    feeding_notes: toNullableString(row.feeding_notes),
    medication_notes: toNullableString(row.medication_notes),
  }));

  const bookings = bookingsRaw.map((row) => ({
    source_external_id: toRequiredString(row.source_external_id, "bookings.source_external_id"),
    owner_source_external_id: toRequiredString(
      row.owner_source_external_id,
      "bookings.owner_source_external_id",
    ),
    check_in_date: toRequiredString(row.check_in_date, "bookings.check_in_date"),
    check_out_date: toRequiredString(row.check_out_date, "bookings.check_out_date"),
    notes: toNullableString(row.notes),
  }));

  const bookingPets = bookingPetsRaw.map((row) => ({
    booking_source_external_id: toRequiredString(
      row.booking_source_external_id,
      "booking_pets.booking_source_external_id",
    ),
    pet_source_external_id: toRequiredString(
      row.pet_source_external_id,
      "booking_pets.pet_source_external_id",
    ),
  }));

  const bookingRoomAssignments = bookingRoomAssignmentsRaw.map((row) => ({
    booking_source_external_id: toRequiredString(
      row.booking_source_external_id,
      "booking_room_assignments.booking_source_external_id",
    ),
    room_source_external_id: toRequiredString(
      row.room_source_external_id,
      "booking_room_assignments.room_source_external_id",
    ),
    start_date: toRequiredString(row.start_date, "booking_room_assignments.start_date"),
    end_date: toRequiredString(row.end_date, "booking_room_assignments.end_date"),
  }));

  return {
    rooms,
    owners,
    pets,
    bookings,
    bookingPets,
    bookingRoomAssignments,
  };
}

export function assertExpectedCounts(counts: ImportCounts) {
  const mismatches = Object.entries(EXPECTED_COUNTS).flatMap(([key, expected]) => {
    const actual = counts[key as keyof ImportCounts];
    if (actual === expected) return [];
    return [`${key}: expected ${expected}, got ${actual}`];
  });

  if (mismatches.length > 0) {
    throw new Error(`Staging row count mismatch:\n${mismatches.join("\n")}`);
  }
}

export function buildImportPayload(stagingDir: string, batchSize = BATCH_SIZE): {
  payload: ImportPayload;
  counts: ImportCounts;
} {
  const rows = loadLegacyRows(stagingDir);
  const counts: ImportCounts = {
    rooms: rows.rooms.length,
    owners: rows.owners.length,
    pets: rows.pets.length,
    bookings: rows.bookings.length,
    bookingPets: rows.bookingPets.length,
    bookingRoomAssignments: rows.bookingRoomAssignments.length,
  };

  assertExpectedCounts(counts);

  return {
    payload: {
      rooms_batches: chunk(rows.rooms, batchSize),
      owners_batches: chunk(rows.owners, batchSize),
      pets_batches: chunk(rows.pets, batchSize),
      bookings_batches: chunk(rows.bookings, batchSize),
      booking_pets_batches: chunk(rows.bookingPets, batchSize),
      booking_room_assignments_batches: chunk(rows.bookingRoomAssignments, batchSize),
    },
    counts,
  };
}

export async function runLegacyImport(options?: {
  stagingDir?: string;
  batchSize?: number;
}) {
  const repoRoot = process.cwd();
  const stagingDir = options?.stagingDir ?? path.join(repoRoot, "migration", "staging");
  const batchSize = options?.batchSize ?? BATCH_SIZE;
  const { payload, counts } = buildImportPayload(stagingDir, batchSize);

  const supabaseUrl = requireEnv("VITE_SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const startedAt = performance.now();
  const { data, error } = await supabase.rpc("do_legacy_import_atomic", {
    p_payload: payload,
  });
  const elapsedMs = Math.round(performance.now() - startedAt);

  if (error) {
    throw new Error(`Legacy import RPC failed: ${error.message}`);
  }

  return {
    elapsedMs,
    stagingCounts: counts,
    affected: data,
    batchSummary: {
      rooms: payload.rooms_batches.length,
      owners: payload.owners_batches.length,
      pets: payload.pets_batches.length,
      bookings: payload.bookings_batches.length,
      bookingPets: payload.booking_pets_batches.length,
      bookingRoomAssignments: payload.booking_room_assignments_batches.length,
    },
  };
}

if (import.meta.main) {
  runLegacyImport()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
