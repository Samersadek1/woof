"""
Woof migration — Phases 2 + 3 + 4 SQL generator
================================================
Generates SQL files to run AFTER do_legacy_import_atomic (phase 1) succeeds.

  /mnt/user-data/outputs/woof_phase2_pets_update.sql      (size/coat/assessment)
  /mnt/user-data/outputs/woof_phase3_vaccinations.sql     (528 pets × up to 5 vaccines)
  /mnt/user-data/outputs/woof_phase4a_halfday_catalog.sql (add half-day package_definitions row)
  /mnt/user-data/outputs/woof_phase4b_packages.sql        (246 purchases + credits + invoices)
  /mnt/user-data/outputs/woof_phase4c_daycare_sessions.sql (3290 usages)

All SQL uses source_external_id lookup (set by phase 1) — no UUID hard-coding.
"""

import pandas as pd
import re
from datetime import timedelta

XLSX = '/mnt/user-data/outputs/WOOF_System_Migration_Simple_PATCHED.xlsx'

sheets = pd.read_excel(XLSX, sheet_name=None)
pets     = sheets['Pets']
pkgs     = sheets['Daycare Packages']
usage    = sheets['Daycare Usage']

# SQL string escaping
def q(v):
    """SQL-escape a string for single-quoted literal. Returns NULL for null/empty."""
    if v is None or (isinstance(v, float) and pd.isna(v)): return 'NULL'
    s = str(v).strip()
    if not s: return 'NULL'
    return "'" + s.replace("'", "''") + "'"

def qd(v):
    """SQL-escape a date — pass through ISO YYYY-MM-DD or NULL."""
    if v is None or pd.isna(v): return 'NULL'
    s = str(v).strip()
    m = re.match(r'^(\d{4}-\d{2}-\d{2})', s)
    return "'" + m.group(1) + "'::date" if m else 'NULL'

# ============================================================
# PHASE 2 — Pets UPDATE
# ============================================================
phase2 = """\
-- =============================================================
-- WOOF Phase 2 — Pets enrichment
-- Run AFTER phase 1 RPC completes.
-- =============================================================

BEGIN;

-- All 1,486 pets default to size='medium' (per migration directive)
UPDATE pets
SET size = 'medium'
WHERE size IS NULL;

-- Re-affirm assessment_status='passed' (RPC sets it, defensive)
UPDATE pets
SET assessment_status = 'passed'
WHERE assessment_status IS DISTINCT FROM 'passed';

-- Sanity counts
SELECT
  COUNT(*) FILTER (WHERE size = 'medium') AS pets_medium,
  COUNT(*) FILTER (WHERE assessment_status = 'passed') AS pets_passed,
  COUNT(*) AS pets_total
FROM pets;

COMMIT;
"""
with open('/mnt/user-data/outputs/woof_phase2_pets_update.sql', 'w') as f:
    f.write(phase2)
print("Wrote phase2_pets_update.sql")

# ============================================================
# PHASE 3 — Vaccinations
# ============================================================
# Per pet, build up to 5 rows:
#   Rabies, DHPPI, KennelCough  -> expiry_date = column value, administered_date = NULL
#   Deworming, FleaTick         -> administered_date = value, expiry_date = value + 90 days

VACC_RULES = [
    # (xlsx_col,                  vaccine_name,    is_expiry, days_to_expiry)
    ('RabiesExpiration',          'rabies',        True,  None),
    ('DHPPIExpiration',           'dhppi',         True,  None),
    ('KennelCoughExpiration',     'kennel_cough',  True,  None),
    ('DewormingDateGiven',        'deworming',     False, 90),
    ('FleaTickDateGiven',         'flea_tick',     False, 90),
]

vacc_rows = []
for _, p in pets.iterrows():
    puid = p['FinalPetUID']
    for col, vname, is_expiry, days in VACC_RULES:
        raw = p[col]
        if pd.isna(raw): continue
        s = str(raw).strip()
        m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
        if not m: continue
        date_iso = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        if is_expiry:
            expiry = date_iso
            administered = None
        else:
            administered = date_iso
            expiry = (pd.Timestamp(date_iso) + timedelta(days=days)).strftime('%Y-%m-%d')
        vacc_rows.append((puid, vname, expiry, administered))

print(f"Vaccination rows to insert: {len(vacc_rows)}")

# Build multi-row INSERT (chunk into batches of 500 for readability)
def chunk(lst, n):
    for i in range(0, len(lst), n): yield lst[i:i+n]

phase3 = """\
-- =============================================================
-- WOOF Phase 3 — Vaccinations
-- Run AFTER phase 2.
-- Inserts {n} vaccination rows for {npets} pets across 5 vaccine types.
--   Rabies/DHPPI/KennelCough: expiry_date from XLSX, administered_date NULL
--   Deworming/FleaTick: administered_date from XLSX, expiry_date = +90 days
-- =============================================================

BEGIN;

-- Stage source rows in a temp table for clean joining
CREATE TEMP TABLE _vacc_stage (
  pet_source_external_id text,
  vaccine_name           text,
  expiry_date            date,
  administered_date      date
) ON COMMIT DROP;

""".format(n=len(vacc_rows),
           npets=sum(1 for _, p in pets.iterrows()
                     if any(pd.notna(p[c]) and re.match(r'^\d{4}-\d{2}-\d{2}', str(p[c]).strip())
                            for c, _, _, _ in VACC_RULES)))

for chunk_rows in chunk(vacc_rows, 500):
    values = ',\n  '.join(
        f"({q(puid)}, {q(vname)}, {qd(expiry)}, {qd(adm) if adm else 'NULL'})"
        for puid, vname, expiry, adm in chunk_rows
    )
    phase3 += f"INSERT INTO _vacc_stage (pet_source_external_id, vaccine_name, expiry_date, administered_date) VALUES\n  {values};\n\n"

phase3 += """\
-- Insert into vaccinations, joining to pets via source_external_id
INSERT INTO vaccinations (pet_id, vaccine_name, expiry_date, administered_date)
SELECT p.id, s.vaccine_name, s.expiry_date, s.administered_date
FROM _vacc_stage s
JOIN pets p ON p.source_external_id = s.pet_source_external_id
WHERE s.expiry_date IS NOT NULL;

-- Sanity: counts by vaccine_name
SELECT vaccine_name, COUNT(*) AS rows
FROM vaccinations
GROUP BY vaccine_name
ORDER BY vaccine_name;

COMMIT;
"""
with open('/mnt/user-data/outputs/woof_phase3_vaccinations.sql', 'w') as f:
    f.write(phase3)
print("Wrote phase3_vaccinations.sql")

# ============================================================
# PHASE 4a — Half-day daycare catalog entry
# ============================================================
phase4a = """\
-- =============================================================
-- WOOF Phase 4a — Add 'six_half_day_dcare' to package_definitions
-- Run BEFORE phase 4b.
-- Mirrors lucky_7's structure: daycare category, 2 months validity,
-- 10% multi-pet discount.
-- =============================================================
-- NOTE: PG enum value additions must commit before they can be used.
--       Step 1 below is INTENTIONALLY outside any BEGIN/COMMIT block.
--       Step 2 inserts can then use the new enum value.
-- =============================================================

-- Step 1: extend service_code enum (auto-commits as a single statement)
DO $$ BEGIN
  ALTER TYPE service_code ADD VALUE 'daycare_half_day';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: catalog entries (in their own transaction; uses the new enum value)
BEGIN;

-- Catalog entry
INSERT INTO package_definitions
  (code, display_name, description, category, validity_months,
   multi_pet_discount_pct, applicable_species, is_active, sort_order)
VALUES
  ('six_half_day_dcare',
   '6 Half-Day Daycare',
   '6 half-day daycare sessions, valid 2 months. 10% discount for multi-pet purchases.',
   'daycare',
   2,
   10.00,
   '{dog}',
   true,
   15)
ON CONFLICT (code) DO NOTHING;

-- Credit grant: 6 half-day sessions
INSERT INTO package_credit_grants
  (package_def_id, service_code, units, is_bonus, sort_order)
SELECT id, 'daycare_half_day'::service_code, 6, false, 0
FROM package_definitions
WHERE code = 'six_half_day_dcare'
ON CONFLICT DO NOTHING;

-- Pricing: 315 AED flat (matches historical base price in XLSX)
INSERT INTO package_pricing
  (package_def_id, pet_size, coat_type, amount_aed, is_active, effective_from)
SELECT id, NULL, NULL, 315.00, true, CURRENT_DATE
FROM package_definitions
WHERE code = 'six_half_day_dcare'
ON CONFLICT DO NOTHING;

-- Verify
SELECT pd.code, pd.display_name, pd.validity_months,
       pcg.service_code, pcg.units,
       pp.amount_aed
FROM package_definitions pd
LEFT JOIN package_credit_grants pcg ON pcg.package_def_id = pd.id
LEFT JOIN package_pricing pp ON pp.package_def_id = pd.id
WHERE pd.code = 'six_half_day_dcare';

COMMIT;
"""
with open('/mnt/user-data/outputs/woof_phase4a_halfday_catalog.sql', 'w') as f:
    f.write(phase4a)
print("Wrote phase4a_halfday_catalog.sql")

# ============================================================
# PHASE 4b — Packages → invoices + purchase_groups + service_credits
# ============================================================

# Map PackageTypeRaw → package_definitions.code
PKG_MAP = {
    # Lucky Seven variants
    'Lucky Seven':                       'lucky_7',
    'Luckey Seven':                      'lucky_7',
    'Lucky seven':                       'lucky_7',
    'Lucy Seven':                        'lucky_7',
    # 30 Day Ticket variants
    '30 Day Ticket':                     'thirty_day_ticket',
    '30 Day Ticket(30 Full Dcare Days)': 'thirty_day_ticket',
    '30 Day Ticket (30 Full Dcare Days)':'thirty_day_ticket',
    # Threes A Charm
    'Threes A Charm':                    'threes_a_charm',
    'Threes-A-Charm':                    'threes_a_charm',
    'Threes a Charm':                    'threes_a_charm',
    # Half-day daycare (NEW catalog entry phase 4a)
    '6 Half day daycare':                'six_half_day_dcare',
    '6 Half day Daycare package':        'six_half_day_dcare',
    'Half daycare day package':          'six_half_day_dcare',
    '6 Half-day daycare':                'six_half_day_dcare',
    'R/A/F 6 half daycare day':          'six_half_day_dcare',
    '6 Half Daycare Day':                'six_half_day_dcare',
    '6 Half-Day Dcare':                  'six_half_day_dcare',
    'A/F/R 6 Half Day Package':          'six_half_day_dcare',
    # SKIP
    'Montly Madness':                    None,
}

# Map package_code → service_code (for credit allocation)
CODE_TO_SVC = {
    'lucky_7':              'daycare_full_day',
    'thirty_day_ticket':    'daycare_full_day',
    'threes_a_charm':       'daycare_full_day',
    'six_half_day_dcare':   'daycare_half_day',
}

# Map package_code → validity_months for expires_at
CODE_TO_VALIDITY = {
    'lucky_7':              2,
    'thirty_day_ticket':    6,
    'threes_a_charm':       1,
    'six_half_day_dcare':   2,
}

def split_pet_uids(s):
    if pd.isna(s): return []
    return [p.strip() for p in re.split(r'\s*/\s*|\s*;\s*|\s*,\s*', str(s)) if p.strip()]

# Build SQL
mapped_pkgs = []
skipped_pkgs = []
for _, p in pkgs.iterrows():
    raw = str(p['PackageTypeRaw']).strip() if pd.notna(p['PackageTypeRaw']) else ''
    code = PKG_MAP.get(raw, '__UNMAPPED__')
    if code is None:   # explicit skip (Monthly Madness)
        skipped_pkgs.append((p['PackageTrackerID'], raw, 'skipped per directive'))
        continue
    if code == '__UNMAPPED__':
        skipped_pkgs.append((p['PackageTrackerID'], raw, 'unmapped — no catalog entry'))
        continue
    pet_uids = split_pet_uids(p['FinalPetUIDs'])
    if not pet_uids:
        skipped_pkgs.append((p['PackageTrackerID'], raw, 'no pet UIDs'))
        continue
    mapped_pkgs.append((p, code, pet_uids))

print(f"Mapped packages: {len(mapped_pkgs)}, skipped: {len(skipped_pkgs)}")
for ptid, raw, reason in skipped_pkgs:
    print(f"  SKIP {ptid}: {raw} ({reason})")

# Determine date_of_purchase fallback for expires_at
def to_iso_date(v, fallback='2026-05-23'):
    if pd.isna(v): return fallback
    try: return pd.Timestamp(v).strftime('%Y-%m-%d')
    except Exception: return fallback

phase4b = """\
-- =============================================================
-- WOOF Phase 4b — Daycare package purchases
-- Run AFTER phase 4a.
-- For each XLSX package: create invoice + purchase_group + service_credits.
-- 1 row per pet in service_credits (units_total = IncludedDays / pet_count).
-- =============================================================

BEGIN;

-- Stage purchases in a temp table
CREATE TEMP TABLE _pkg_stage (
  source_tracker_id     text,
  invoice_number        text,
  package_code          text,
  service_code          text,
  owner_source_ext_id   text,
  pet_source_ext_ids    text[],
  included_days         int,
  utilized_days         int,
  invoice_qty           int,
  package_value_aed     numeric,
  amount_paid_aed       numeric,
  amount_pending_aed    numeric,
  purchase_date         date,
  expires_at            date,
  notes                 text
) ON COMMIT DROP;

"""

# Insert staging rows in chunks
stage_rows = []
for p, code, pet_uids in mapped_pkgs:
    ptid = p['PackageTrackerID']
    inv  = p['InvoiceNumber'] if pd.notna(p['InvoiceNumber']) else f'LEGACY-{ptid}'
    owner = p['FinalClientUID']
    inc_days = int(p['IncludedDays']) if pd.notna(p['IncludedDays']) else 0
    utilized_days = int(p['UtilizedDays']) if pd.notna(p['UtilizedDays']) else 0
    inv_qty  = int(p['InvoicePackageQty']) if pd.notna(p['InvoicePackageQty']) else 1
    value    = float(p['PackageValueAED']) if pd.notna(p['PackageValueAED']) else 0.0
    paid     = float(p['AmountPaidAED']) if pd.notna(p['AmountPaidAED']) else 0.0
    pending  = float(p['AmountPendingAED']) if pd.notna(p['AmountPendingAED']) else 0.0
    pdate    = to_iso_date(p['DateOfPurchase'])
    validity_m = CODE_TO_VALIDITY.get(code, 2)
    expires  = (pd.Timestamp(pdate) + pd.DateOffset(months=validity_m)).strftime('%Y-%m-%d')
    svc      = CODE_TO_SVC.get(code, 'daycare_full_day')
    note_parts = []
    if pd.notna(p['PackageName']) and str(p['PackageName']).strip() != str(p['PackageTypeRaw']).strip():
        note_parts.append(f"orig_name={p['PackageName']}")
    note_parts.append(f"raw_type={p['PackageTypeRaw']}")
    if pd.notna(p.get('NeedsPriceReview')) and str(p.get('NeedsPriceReview')).lower().startswith('y'):
        note_parts.append('NEEDS_PRICE_REVIEW')
    if pd.notna(p.get('NeedsInvoiceReview')) and str(p.get('NeedsInvoiceReview')).lower().startswith('y'):
        note_parts.append('NEEDS_INVOICE_REVIEW')
    note = ' | '.join(note_parts)
    stage_rows.append((ptid, inv, code, svc, owner, pet_uids, inc_days, utilized_days, inv_qty,
                       value, paid, pending, pdate, expires, note))

for batch in chunk(stage_rows, 200):
    values = []
    for r in batch:
        (ptid, inv, code, svc, owner, pet_uids, inc, util, qty, val, paid, pend, pdate, exp, note) = r
        pet_arr = 'ARRAY[' + ','.join(q(u) for u in pet_uids) + ']::text[]'
        values.append(
            f"({q(ptid)}, {q(inv)}, {q(code)}, {q(svc)}, {q(owner)}, {pet_arr}, "
            f"{inc}, {util}, {qty}, {val}, {paid}, {pend}, "
            f"{qd(pdate)}, {qd(exp)}, {q(note)})"
        )
    phase4b += f"INSERT INTO _pkg_stage VALUES\n  " + ',\n  '.join(values) + ";\n\n"

phase4b += """\
-- 1) Create invoices for each package (one per row).
--    NULL-invoice packages got synthetic 'LEGACY-{tracker_id}' numbers
--    in the staging step to prevent NULL-join cartesian on later steps.
INSERT INTO invoices (owner_id, invoice_number, issue_date, total, subtotal, status, notes)
SELECT o.id,
       s.invoice_number,
       s.purchase_date,
       s.package_value_aed,
       s.package_value_aed,
       (CASE WHEN s.amount_pending_aed > 0 THEN 'partially_paid'
             WHEN s.amount_paid_aed >= s.package_value_aed THEN 'paid'
             ELSE 'issued'
        END)::invoice_status,
       -- Tracker is ALWAYS followed by ' |' so subsequent LIKE patterns can use
       -- 'tracker=X |%' to match without prefix-collision risk
       -- (e.g. PKG-93219 vs PKG-93219-93263).
       'Legacy daycare package purchase | tracker=' || s.source_tracker_id || ' |' ||
        CASE WHEN s.invoice_number LIKE 'LEGACY-%' THEN ' NO_SOURCE_INVOICE |' ELSE '' END ||
        CASE WHEN s.notes IS NOT NULL THEN ' ' || s.notes ELSE '' END
FROM _pkg_stage s
JOIN owners o ON o.source_external_id = s.owner_source_ext_id;

-- 2) Invoice line items (1 per package, qty = invoice_qty).
--    NOTE: The set_invoice_number BEFORE INSERT trigger on invoices overwrites
--    our staged invoice_number with INV-2026-NNNNN. We can't join on
--    invoice_number anymore — we join via the notes-tracker pattern instead.
INSERT INTO invoice_line_items (invoice_id, description, unit_price, total_price)
SELECT i.id,
       'Package: ' || s.package_code || ' (' || s.included_days || ' sessions)',
       CASE WHEN s.invoice_qty > 0 THEN s.package_value_aed / s.invoice_qty ELSE s.package_value_aed END,
       s.package_value_aed
FROM _pkg_stage s
JOIN owners o ON o.source_external_id = s.owner_source_ext_id
JOIN invoices i ON i.owner_id = o.id 
              AND i.notes LIKE 'Legacy daycare package purchase | tracker=' || s.source_tracker_id || ' |%';

-- 3) Purchase groups (one per package; multi_pet_discount = 10 if pet_count > 1 else 0)
INSERT INTO purchase_groups (owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
SELECT o.id, i.id, pd.id,
       CARDINALITY(s.pet_source_ext_ids),
       CASE WHEN CARDINALITY(s.pet_source_ext_ids) > 1 THEN 10.00 ELSE 0.00 END
FROM _pkg_stage s
JOIN owners o ON o.source_external_id = s.owner_source_ext_id
JOIN package_definitions pd ON pd.code = s.package_code
JOIN invoices i ON i.owner_id = o.id 
              AND i.notes LIKE 'Legacy daycare package purchase | tracker=' || s.source_tracker_id || ' |%';

-- 4) Service credits: 1 row per pet per package
--    units_total = floor(included_days / pet_count) — remainder unallocated
--    units_consumed = floor(utilized_days / pet_count) — from source UtilizedDays
--                     (NOT computed from daycare_sessions; avoids over-attribution
--                      when an owner has multiple packages of the same code)
--    expires_at from staging.
--    source_type = 'package_purchase' — matches the check constraint on service_credits
INSERT INTO service_credits (
  pet_id, service_code, units_total, units_consumed,
  expires_at, source_type, source_ref_id, purchase_group_id
)
WITH per_pet AS (
  SELECT s.*, UNNEST(s.pet_source_ext_ids) AS pet_ext_id,
         CARDINALITY(s.pet_source_ext_ids) AS n_pets
  FROM _pkg_stage s
),
joined AS (
  SELECT pp.*, p.id AS pet_id, o.id AS owner_id,
         pg.id AS purchase_group_id
  FROM per_pet pp
  JOIN pets p ON p.source_external_id = pp.pet_ext_id
  JOIN owners o ON o.source_external_id = pp.owner_source_ext_id
  JOIN package_definitions pd ON pd.code = pp.package_code
  -- Match invoice via tracker in notes (set_invoice_number trigger overwrites
  -- the original invoice_number, so we can't join on it). Boundary ' |%'
  -- prevents prefix collisions like PKG-93219 matching PKG-93219-93263.
  JOIN invoices i ON i.owner_id = o.id 
                AND i.notes LIKE 'Legacy daycare package purchase | tracker=' || pp.source_tracker_id || ' |%'
  JOIN purchase_groups pg ON pg.owner_id = o.id 
                         AND pg.package_def_id = pd.id
                         AND pg.invoice_id = i.id
)
SELECT pet_id,
       service_code::service_code,
       (included_days / n_pets)::int  AS units_total,
       LEAST((included_days / n_pets)::int,
             (utilized_days / n_pets)::int) AS units_consumed,
       expires_at,
       'package_purchase',  -- service_credits.source_type CHECK constraint requires this value
       NULL,
       purchase_group_id
FROM joined;

-- Sanity counts
SELECT
  (SELECT COUNT(*) FROM invoices WHERE notes LIKE 'Legacy daycare%') AS legacy_invoices,
  (SELECT COUNT(*) FROM purchase_groups)                              AS purchase_groups,
  (SELECT COUNT(*) FROM service_credits)                              AS service_credits;

COMMIT;
"""
with open('/mnt/user-data/outputs/woof_phase4b_packages.sql', 'w') as f:
    f.write(phase4b)
print("Wrote phase4b_packages.sql")

# ============================================================
# PHASE 4c — Daycare sessions
# ============================================================
# For each parsed usage row: insert daycare_session row.
# Skip rows where UsageDate can't be parsed.

usage_rows = []
# ---------- Smart date parser (v2) ----------
# Handles patterns that the original strict parser dropped (~14% of usage rows):
#  - "Bella 2025-11-28"       (ISO date with pet-name prefix)
#  - "Jan 20 WPT 184"         (month-name + day + staff annotation)
#  - "11 April Lotus"         (day-first, month name, pet-name suffix)
#  - "Meimei Jan-27"          (pet name, month-name with dash)
#  - "Free SSPL used free wash on May 14"  (date embedded in sentence)
# For month-name+day without year, infers year from package DateOfPurchase.
_MONTHS = {'jan':1,'january':1,'feb':2,'february':2,'mar':3,'march':3,'apr':4,'april':4,
           'may':5,'jun':6,'june':6,'jul':7,'july':7,'aug':8,'august':8,
           'sep':9,'sept':9,'september':9,'oct':10,'october':10,'nov':11,'november':11,
           'dec':12,'december':12}
_MONTH_FIRST  = re.compile(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*[-\s]?\s*(\d{1,2})\b', re.I)
_DAY_FIRST    = re.compile(r'\b(\d{1,2})\s*[-\s]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b', re.I)
_ISO_ANYWHERE = re.compile(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})')
_DDMMYY       = re.compile(r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b')

def _parse_purchase_to_ts(s):
    if pd.isna(s): return None
    try:
        ts = pd.to_datetime(str(s).strip(), errors='coerce', dayfirst=False)
        if pd.notna(ts): return ts
    except: pass
    m_year = re.search(r'\b(20\d{2})\b', str(s))
    if not m_year: return None
    m = _MONTH_FIRST.search(str(s)) or _DAY_FIRST.search(str(s))
    if not m: return None
    g = m.groups()
    try:
        if g[0].isdigit(): day, mon_name = int(g[0]), g[1]
        else:              mon_name, day = g[0], int(g[1])
        mon = _MONTHS.get(mon_name.lower()) or _MONTHS.get(mon_name.lower()[:3])
        return pd.Timestamp(year=int(m_year.group(1)), month=mon, day=day)
    except: return None

# Build PackageTrackerID -> purchase_ts lookup for year inference
_PKG_PURCHASE = {p['PackageTrackerID']: _parse_purchase_to_ts(p['DateOfPurchase'])
                 for _, p in pkgs.iterrows() if pd.notna(p.get('PackageTrackerID'))}

def parse_usage_date_smart(raw, tracker_id):
    """Return ISO date string or None. Multi-strategy parser."""
    if pd.isna(raw): return None
    s = str(raw).strip()
    if not s: return None
    # 1) Strict ISO at start
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        try: return pd.Timestamp(s).strftime('%Y-%m-%d')
        except: pass
    # 2) ISO anywhere in string
    m = _ISO_ANYWHERE.search(s)
    if m:
        try: return pd.Timestamp(year=int(m.group(1)), month=int(m.group(2)),
                                 day=int(m.group(3))).strftime('%Y-%m-%d')
        except: pass
    # 3) DD/MM/YYYY (UAE day-first convention when ambiguous)
    m = _DDMMYY.search(s)
    if m:
        try:
            day, mon, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if yr < 100: yr += 2000
            return pd.Timestamp(year=yr, month=mon, day=day).strftime('%Y-%m-%d')
        except: pass
    # 4) Month-name + day, year inferred from package
    md = None
    m = _MONTH_FIRST.search(s)
    if m:
        mon = _MONTHS.get(m.group(1).lower()) or _MONTHS.get(m.group(1).lower()[:3])
        day = int(m.group(2))
        if mon and 1 <= day <= 31: md = (mon, day)
    if md is None:
        m = _DAY_FIRST.search(s)
        if m:
            day = int(m.group(1))
            mon = _MONTHS.get(m.group(2).lower()) or _MONTHS.get(m.group(2).lower()[:3])
            if mon and 1 <= day <= 31: md = (mon, day)
    if md is None: return None
    purchase_ts = _PKG_PURCHASE.get(tracker_id)
    if purchase_ts is None: return None
    candidates = []
    for y in [purchase_ts.year, purchase_ts.year + 1, purchase_ts.year - 1]:
        try: d = pd.Timestamp(year=y, month=md[0], day=md[1])
        except: continue
        delta = (d - purchase_ts).days
        if -7 <= delta <= 400: candidates.append((d, abs(delta)))
    return min(candidates, key=lambda x: x[1])[0].strftime('%Y-%m-%d') if candidates else None


unparseable_usage = 0
for _, u in usage.iterrows():
    raw = u['UsageDateRaw']
    d = parse_usage_date_smart(raw, u.get('PackageTrackerID'))
    if d is None:
        unparseable_usage += 1
        continue

    # Determine package code from PackageTrackerID lookup
    tracker = u['PackageTrackerID']
    matching = pkgs[pkgs['PackageTrackerID']==tracker]
    if len(matching)==0:
        unparseable_usage += 1
        continue
    raw_type = str(matching.iloc[0]['PackageTypeRaw']).strip()
    code = PKG_MAP.get(raw_type)
    if not code:
        # Skip Monthly Madness usages too
        unparseable_usage += 1
        continue

    owner = u['FinalClientUID']
    pet_uids = split_pet_uids(u['FinalPetUIDs'])
    if not pet_uids:
        unparseable_usage += 1
        continue

    # If multiple pets, create one session per pet for that date
    for puid in pet_uids:
        usage_rows.append((tracker, code, owner, puid, d, str(u['UsageSlot']) if pd.notna(u['UsageSlot']) else ''))

print(f"Daycare session rows to insert: {len(usage_rows)} (skipped {unparseable_usage})")

phase4c = f"""\
-- =============================================================
-- WOOF Phase 4c — Daycare sessions (historical usage)
-- Run AFTER phase 4b.
-- Inserts {len(usage_rows)} daycare_session rows from {len(usage)} usage rows
-- ({unparseable_usage} skipped: unparseable date, unmapped package, or no pet UIDs).
-- =============================================================

BEGIN;

CREATE TEMP TABLE _session_stage (
  tracker_id          text,
  package_code        text,
  owner_source_ext_id text,
  pet_source_ext_id   text,
  session_date        date,
  usage_slot          text
) ON COMMIT DROP;

"""

for batch in chunk(usage_rows, 500):
    values = ',\n  '.join(
        f"({q(t)}, {q(c)}, {q(o)}, {q(pu)}, {qd(d)}, {q(slot)})"
        for t, c, o, pu, d, slot in batch
    )
    phase4c += f"INSERT INTO _session_stage VALUES\n  {values};\n\n"

phase4c += """\
-- Resolve owner_id, pet_id, package_id
INSERT INTO daycare_sessions (owner_id, pet_id, package_id, session_date, checked_in, notes)
SELECT o.id, p.id, pd.id, s.session_date, true,
       'Legacy migration | tracker=' || s.tracker_id || ' | slot=' || s.usage_slot
FROM _session_stage s
JOIN owners o ON o.source_external_id = s.owner_source_ext_id
JOIN pets   p ON p.source_external_id = s.pet_source_ext_id
JOIN package_definitions pd ON pd.code = s.package_code;

-- NOTE: units_consumed is set during phase 4b service_credits INSERT,
--       using the source XLSX UtilizedDays value directly (not computed
--       from daycare_sessions count). This avoids over-attribution when
--       an owner has multiple packages of the same code (e.g. Loki
--       Mouchantaf CL000232 with 2 separate Lucky Seven packages).

-- Sanity
SELECT
  (SELECT COUNT(*) FROM daycare_sessions WHERE notes LIKE 'Legacy migration%') AS legacy_sessions,
  (SELECT SUM(units_consumed) FROM service_credits) AS total_consumed,
  (SELECT SUM(units_total) FROM service_credits)    AS total_credits;

COMMIT;
"""
with open('/mnt/user-data/outputs/woof_phase4c_daycare_sessions.sql', 'w') as f:
    f.write(phase4c)
print("Wrote phase4c_daycare_sessions.sql")

print("\n=== Summary ===")
print(f"Phase 2: pets update (size='medium', assessment='passed')")
print(f"Phase 3: {len(vacc_rows)} vaccination rows")
print(f"Phase 4a: half-day daycare catalog entry (1 package_definitions + 1 credit_grant + 1 pricing)")
print(f"Phase 4b: {len(mapped_pkgs)} package purchases (skipped {len(skipped_pkgs)}: {[(s[0], s[2]) for s in skipped_pkgs]})")
print(f"Phase 4c: {len(usage_rows)} daycare sessions (skipped {unparseable_usage} usage rows)")
