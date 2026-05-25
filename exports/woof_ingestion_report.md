# Woof May 23–25 2026 audit ingestion report

**Project:** `wineliuwejkxwsdbrthb`  
**Last applied:** 2026-05-25 (rerun with audit workbook)  
**Primary source:** `exports/woof_may23-25_invoice_audit.xlsx` — sheet **Review Required** (125 rows)

## Rerun summary (audit workbook)

| Step | Action | Count |
|------|--------|------:|
| STEP 1 | Locked overrides (dates, invoices, cancellations) | 12 refs — unchanged from first run |
| STEP 2 | Bulk `check_in_date` / `check_out_date` from **audit** sheet | **113** rows |
| Missing refs in Supabase | 0 (all 125 audit refs exist) |
| Unparseable dates | 0 |

**Important:** Bulk dates now match the audit sheet (true stay spans), not the earlier on-site export. Many check-ins are **earlier** than the on-site file (e.g. `WOOF-2026-00894`: 2026-04-30 → 2026-05-24; `WOOF-2026-00605`: 2026-03-28 → 2026-06-25).

## Locked invoice totals (still valid)

| Booking ref | Total (AED) | Status |
|-------------|------------:|--------|
| WOOF-2026-00641 | 935.50 | paid |
| WOOF-2026-00700 | 180.50 | paid |
| WOOF-2026-00709 | 115.50 | paid |
| WOOF-2026-00908 | 115.50 | paid |
| WOOF-2026-00835 | 2,772.00 | paid |
| WOOF-2026-00846 | 1,386.00 | paid |
| WOOF-2026-00904 | 1,530.00 | paid (grooming TBD) |

## Cancellations / duplicate

| Ref | Status |
|-----|--------|
| WOOF-2026-00903 | `cancelled` — duplicate of 00904 |
| WOOF-2026-00925, 00725, 00831 | `cancelled` — audit |

## In-stay

`WOOF-2026-00898` — `checked_in`, 2026-05-03 → 2026-06-03; double occupancy 15% at checkout via RPC.

## Artifacts

- `exports/woof_may23-25_invoice_audit.xlsx` — source of truth for Review Required
- `sql/may23-25_audit_ingestion.sql` — regenerated (113 bulk rows from audit)
- `scripts/generate_may23_25_audit_sql.py` — reads audit xlsx by default
- `exports/missing_refs.csv` — empty
- `exports/may23-25_xlsx_refs.txt` — 125 refs from audit sheet

## Verification SQL

```sql
-- Spot-check audit dates applied
SELECT booking_ref, check_in_date, check_out_date
FROM bookings
WHERE booking_ref IN ('WOOF-2026-00894', 'WOOF-2026-00605', 'WOOF-2026-00616')
ORDER BY 1;

SELECT b.booking_ref, i.total, i.status
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
WHERE b.booking_ref IN (
  'WOOF-2026-00641','WOOF-2026-00700','WOOF-2026-00709','WOOF-2026-00908',
  'WOOF-2026-00835','WOOF-2026-00846'
);
```
