"""
Woof migration — Phase 0 + Phase 1 generator
============================================
Inputs: /mnt/user-data/outputs/WOOF_System_Migration_Simple_PATCHED.xlsx
Outputs:
  /mnt/user-data/outputs/woof_phase0_wipe.sql           -- TRUNCATE + setup
  /mnt/user-data/outputs/woof_phase1_payload.json       -- do_legacy_import_atomic input
  /mnt/user-data/outputs/woof_phase1_call.sql           -- SQL wrapper to invoke RPC
  /mnt/user-data/outputs/woof_phase1_room_check.sql     -- pre-import verification
"""

import pandas as pd
import json
import re
from datetime import datetime, timedelta

XLSX = '/mnt/user-data/outputs/WOOF_System_Migration_Simple_PATCHED.xlsx'

sheets = pd.read_excel(XLSX, sheet_name=None)
clients  = sheets['Clients']
pets     = sheets['Pets']
bookings = sheets['Boarding Bookings']
room_asgn = sheets['Room Assignments']

# ============================================================
# PHASE 0 — wipe script (FK-safe order)
# ============================================================
phase0_sql = """\
-- =============================================================
-- WOOF Phase 0 — wipe transactional data
-- Run in Supabase SQL editor BEFORE Phase 1.
-- Reference tables (rooms, service_rates, peak_periods,
-- package_definitions, package_pricing, package_credit_grants,
-- service_code_meta, staff) are untouched.
-- =============================================================

BEGIN;

-- Step 1: drop dependents first
TRUNCATE TABLE
  booking_pets,
  booking_room_assignments,
  booking_addons,
  booking_items,
  invoice_line_items,
  service_credits,
  daycare_sessions,
  purchase_groups,
  vaccinations,
  invoices,
  bookings,
  billing_adjustments,
  wallet_transactions,
  pets
RESTART IDENTITY CASCADE;

-- Step 2: clear owners (cascades, but dependents are already empty)
TRUNCATE TABLE owners RESTART IDENTITY CASCADE;

-- Step 3: drop the 2 QA/test rooms (F100, D100) — not real rooms
DELETE FROM rooms WHERE room_number IN ('F100', 'D100');

-- Step 4: backfill rooms.source_external_id from room_number
-- so the import RPC can resolve booking_room_assignments by name.
UPDATE rooms
SET source_external_id = COALESCE(source_external_id, room_number)
WHERE source_external_id IS NULL OR source_external_id = '';

-- Verification — row counts AFTER wipe (should all be 0 except rooms = 97)
SELECT 'owners' AS table_name, COUNT(*) AS n FROM owners
UNION ALL SELECT 'pets', COUNT(*) FROM pets
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'booking_pets', COUNT(*) FROM booking_pets
UNION ALL SELECT 'booking_room_assignments', COUNT(*) FROM booking_room_assignments
UNION ALL SELECT 'vaccinations', COUNT(*) FROM vaccinations
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'invoice_line_items', COUNT(*) FROM invoice_line_items
UNION ALL SELECT 'purchase_groups', COUNT(*) FROM purchase_groups
UNION ALL SELECT 'service_credits', COUNT(*) FROM service_credits
UNION ALL SELECT 'daycare_sessions', COUNT(*) FROM daycare_sessions
UNION ALL SELECT 'rooms (kept)', COUNT(*) FROM rooms;

COMMIT;
"""

with open('/mnt/user-data/outputs/woof_phase0_wipe.sql','w') as f:
    f.write(phase0_sql)
print("Wrote phase0 wipe SQL")

# ============================================================
# PHASE 1 — build do_legacy_import_atomic payload
# ============================================================

def safe(v):
    """Return string or None for NaN/empty."""
    if pd.isna(v): return None
    s = str(v).strip()
    return s if s else None

def to_date(v):
    if pd.isna(v): return None
    if isinstance(v, str):
        m = re.match(r'^(\d{4}-\d{2}-\d{2})', v)
        return m.group(1) if m else None
    try:
        return pd.Timestamp(v).strftime('%Y-%m-%d')
    except Exception:
        return None

# ---- OWNERS ----
owners_payload = []
for _, r in clients.iterrows():
    first = safe(r['OwnerFirstName']) or safe(r['ClientDisplayName']) or 'Unknown'
    last  = safe(r['OwnerLastName'])

    # Consolidate owner-level notes (Important, Vet/Emergency, Vacc, Extra)
    note_parts = []
    if (v := safe(r['ImportantNote'])):              note_parts.append(f"Important: {v}")
    if (v := safe(r['EmergencyOrHospital'])):        note_parts.append(f"Vet/Emergency: {v}")
    if (v := safe(r['ClientDateVaccinationNotes'])): note_parts.append(f"Vacc: {v}")
    if (v := safe(r['ExtraNote'])):                  note_parts.append(f"Extra: {v}")
    notes = ' | '.join(note_parts) if note_parts else None

    owner = {
        'source_external_id': r['FinalClientUID'],
        'first_name': first,
    }
    if last:                          owner['last_name'] = last
    if (p := safe(r['ContactNumber'])): owner['phone'] = p
    if (e := safe(r['Email'])):         owner['email'] = e
    if notes:                          owner['notes'] = notes
    owners_payload.append(owner)

print(f"owners_payload: {len(owners_payload)}")

# ---- PETS ----
pets_payload = []
for _, r in pets.iterrows():
    name = safe(r['PetName']) or 'Unnamed'
    # Combine feeding notes: Food + Amount
    food   = safe(r['Food'])
    amount = safe(r['Amount'])
    if food and amount:   feeding = f"{food} | {amount}"
    elif food:            feeding = food
    elif amount:          feeding = amount
    else:                 feeding = None

    pet = {
        'source_external_id': r['FinalPetUID'],
        'owner_source_external_id': r['FinalClientUID'],
        'name': name,
        'species': 'dog',  # Woof appears dog-focused per pricelist; adjust if cats appear
    }
    if (st := safe(r['PetStatus'])):
        # Map XLSX PetStatus to DB-meaningful status; default to 'active'
        pet['status'] = 'inactive' if 'passed' in st.lower() or 'inactive' in st.lower() else 'active'
    if (b := safe(r['Behaviour'])):  pet['behaviour_notes']  = b
    if feeding:                       pet['feeding_notes']   = feeding
    if (m := safe(r['Medicine'])):    pet['medication_notes']= m
    pets_payload.append(pet)

print(f"pets_payload: {len(pets_payload)}")

# ---- ROOMS (new ones not in DB — pass all distinct, RPC upserts) ----
all_room_names = set()
for v in bookings['RoomsUsed'].dropna():
    for x in re.split(r'\s*/\s*', str(v)):
        x = x.strip()
        if x: all_room_names.add(x)
for v in room_asgn['Room'].dropna():
    x = str(v).strip()
    if x: all_room_names.add(x)

rooms_payload = [
    {'source_external_id': 'ROOM-' + rn, 'name': rn, 'is_active': True}
    for rn in sorted(all_room_names)
]
print(f"rooms_payload: {len(rooms_payload)}")

# ---- BOOKINGS ----
bookings_payload = []
booking_pets_payload = []

def split_pet_uids(s):
    if pd.isna(s): return []
    return [p.strip() for p in re.split(r'\s*/\s*|\s*;\s*|\s*,\s*', str(s)) if p.strip()]

for _, r in bookings.iterrows():
    bid = r['BoardingBookingID']
    ci  = to_date(r['CheckInDate'])
    co  = to_date(r['CheckOutDate'])
    if not ci or not co: continue  # skip malformed

    # Note compiles: SourceName, resolution status, synthetic flag
    note_parts = []
    if (v := safe(r['SourceName'])):              note_parts.append(f"src: {v}")
    if (v := safe(r['ProfileResolutionStatus'])): note_parts.append(f"resolution: {v}")
    if str(r['IsSyntheticProfile']).strip().lower() == 'yes':
        note_parts.append('synthetic_profile')
    notes = ' | '.join(note_parts) if note_parts else None

    booking = {
        'source_external_id': bid,
        'owner_source_external_id': r['FinalClientUID'],
        'check_in_date': ci,
        'check_out_date': co,
    }
    if notes: booking['notes'] = notes
    bookings_payload.append(booking)

    for puid in split_pet_uids(r['FinalPetUIDs']):
        booking_pets_payload.append({
            'booking_source_external_id': bid,
            'pet_source_external_id': puid,
        })

print(f"bookings_payload: {len(bookings_payload)}")
print(f"booking_pets_payload: {len(booking_pets_payload)}")

# ---- BOOKING_ROOM_ASSIGNMENTS (collapse per-day rows into per-room spans) ----
# For each booking, group its Room Assignments by Room, then find consecutive
# date ranges → emit one span per range.

# First, link Room Assignments to bookings. The XLSX doesn't carry BoardingBookingID
# on Room Assignments, so we re-match on (FinalClientUID, Date, FinalPetUIDs).
# Easiest: for each booking, find Room Assignments where the booking date range
# covers the row's Date AND the FinalClientUID matches.

room_asgn['_date'] = pd.to_datetime(room_asgn['Date'], errors='coerce')
bookings['_ci'] = pd.to_datetime(bookings['CheckInDate'], errors='coerce')
bookings['_co'] = pd.to_datetime(bookings['CheckOutDate'], errors='coerce')

# Build a lookup: for fast date-range filtering, index room_asgn by client
ra_by_client = room_asgn.groupby('FinalClientUID')

bra_payload = []
unmatched_room_asgn_count = 0

# ----------------------------------------------------------------
# Date convention for booking_room_assignments
# ----------------------------------------------------------------
# Woof's `booking_room_assignments` table has a check constraint:
#   end_date > start_date
# This implies an EXCLUSIVE end_date convention (Woof reads end_date
# as the morning of departure, so days_in_room = end_date - start_date).
#
# Our source XLSX has one row per date the dog was in the room — i.e.
# INCLUSIVE dates. So if a dog occupied A12 on May 1, 2, 3, 4, 5 (5 dates),
# under EXCLUSIVE convention we should emit start=May 1, end=May 6
# (departure morning), making days_in_room = 5.
#
# But the original migration emitted start=May 1, end=May 5 (inclusive).
# Single-day spans (end == start) failed the check constraint and were
# bumped +1 day during import — correctly arriving at exclusive interpretation.
# Multi-day spans (end > start) were NOT bumped, so they stored 1 day SHORT
# of the true source occupancy (5 dates in source → 4 days_in_room in DB).
#
# Toggle below controls whether to emit exclusive end_date on re-run.
# Default False = match historical behaviour (DO NOT silently fix existing data).
# Set to True ONLY if you've verified the in-app display is showing
# multi-day stays 1 day short and want a clean re-run.

EMIT_EXCLUSIVE_END_DATE = False   # see comment above

def consecutive_spans(dates):
    """Given a sorted list of date strings, yield (start, end) inclusive spans."""
    if not dates: return
    start = prev = dates[0]
    for d in dates[1:]:
        if (pd.Timestamp(d) - pd.Timestamp(prev)).days == 1:
            prev = d
        else:
            yield (start, prev)
            start = prev = d
    yield (start, prev)

for _, b in bookings.iterrows():
    bid  = b['BoardingBookingID']
    cuid = b['FinalClientUID']
    ci   = b['_ci']; co = b['_co']
    if pd.isna(ci) or pd.isna(co): continue
    if cuid not in ra_by_client.groups: continue

    ra_sub = ra_by_client.get_group(cuid)
    in_range = ra_sub[(ra_sub['_date'] >= ci) & (ra_sub['_date'] <= co)]
    # Group by room, find consecutive date spans
    for room, grp in in_range.groupby('Room'):
        dates = sorted(grp['_date'].dt.strftime('%Y-%m-%d').tolist())
        for s, e in consecutive_spans(dates):
            # If EMIT_EXCLUSIVE_END_DATE is True, bump end by 1 day to convert
            # from inclusive (last occupied date) to exclusive (departure morning).
            if EMIT_EXCLUSIVE_END_DATE:
                e_out = (pd.Timestamp(e) + pd.Timedelta(days=1)).strftime('%Y-%m-%d')
            else:
                e_out = e
            bra_payload.append({
                'booking_source_external_id': bid,
                'room_source_external_id': 'ROOM-' + str(room).strip(),
                'start_date': s,
                'end_date': e_out,
            })

print(f"booking_room_assignments_payload: {len(bra_payload)} (collapsed from {len(room_asgn)} daily rows)")

# ---- ASSEMBLE PAYLOAD ----
# Batching: keep most as single batches; split large arrays into 500-row batches
def batch(items, size=500):
    return [items[i:i+size] for i in range(0, len(items), size)] if items else [[]]

payload = {
    'rooms_batches':              batch(rooms_payload),
    'owners_batches':             batch(owners_payload),
    'pets_batches':               batch(pets_payload),
    'bookings_batches':           batch(bookings_payload),
    'booking_pets_batches':       batch(booking_pets_payload),
    'booking_room_assignments_batches': batch(bra_payload),
}

OUT_JSON = '/mnt/user-data/outputs/woof_phase1_payload.json'
with open(OUT_JSON,'w') as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

# Size check
import os
size_mb = os.path.getsize(OUT_JSON) / 1024 / 1024
print(f"\nWrote {OUT_JSON} ({size_mb:.2f} MB)")

# ---- SQL wrapper to invoke RPC ----
wrapper_sql = """\
-- =============================================================
-- WOOF Phase 1 — invoke do_legacy_import_atomic
-- =============================================================
-- The payload JSON is large; recommended paths to call the RPC:
--   A) Supabase SQL editor: paste the entire JSON between the dollar quotes
--      below (replace <PASTE_JSON_HERE>).
--   B) psql:
--        \\set payload `cat woof_phase1_payload.json`
--        SELECT do_legacy_import_atomic(:'payload'::jsonb);
--   C) supabase CLI / edge function: pass the JSON file as the argument.
-- =============================================================

SELECT do_legacy_import_atomic($PAYLOAD$
<PASTE_JSON_HERE>
$PAYLOAD$::jsonb);

-- After the RPC returns, verify counts:
SELECT 'owners' AS t, COUNT(*) AS n FROM owners
UNION ALL SELECT 'pets', COUNT(*) FROM pets
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'booking_pets', COUNT(*) FROM booking_pets
UNION ALL SELECT 'booking_room_assignments', COUNT(*) FROM booking_room_assignments
UNION ALL SELECT 'rooms', COUNT(*) FROM rooms;
"""
with open('/mnt/user-data/outputs/woof_phase1_call.sql','w') as f:
    f.write(wrapper_sql)

# ---- Pre-flight room check ----
preflight = f"""\
-- =============================================================
-- WOOF Phase 1 — pre-flight check
-- Run AFTER phase0 wipe and BEFORE the import RPC call.
-- Lists XLSX room names with no matching room row in DB.
-- =============================================================

WITH xlsx_rooms(name) AS (VALUES
{',\n'.join("  ('" + rn.replace("'","''") + "')" for rn in sorted(all_room_names))}
)
SELECT x.name AS xlsx_room_name,
       CASE WHEN r.id IS NULL THEN 'WILL CREATE (via rooms_batches)' ELSE 'matches existing room' END AS status,
       r.wing, r.room_type
FROM xlsx_rooms x
LEFT JOIN rooms r ON r.room_number = x.name OR r.source_external_id = x.name
ORDER BY (r.id IS NULL) DESC, x.name;
"""
with open('/mnt/user-data/outputs/woof_phase1_room_check.sql','w') as f:
    f.write(preflight)

# ---- Summary printout ----
print(f"""
======================================================
PHASE 1 PAYLOAD SUMMARY
======================================================
  rooms_batches:                       {len(rooms_payload)} rows in {len(payload['rooms_batches'])} batch(es)
  owners_batches:                      {len(owners_payload)} rows in {len(payload['owners_batches'])} batch(es)
  pets_batches:                        {len(pets_payload)} rows in {len(payload['pets_batches'])} batch(es)
  bookings_batches:                    {len(bookings_payload)} rows in {len(payload['bookings_batches'])} batch(es)
  booking_pets_batches:                {len(booking_pets_payload)} rows in {len(payload['booking_pets_batches'])} batch(es)
  booking_room_assignments_batches:    {len(bra_payload)} rows in {len(payload['booking_room_assignments_batches'])} batch(es)
======================================================
""")
