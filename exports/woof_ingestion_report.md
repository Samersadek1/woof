# Woof May 23–25 2026 audit ingestion report

**Project:** `wineliuwejkxwsdbrthb`  
**Applied:** 2026-05-25 (via Supabase MCP `execute_sql`, batched)  
**Source used:** `exports/bookings-on-site-may23-25-2026.xlsx` (sheet `May 23-25 2026`, 131 rows)  
**Note:** `woof_may23-25_invoice_audit.xlsx` / "Review Required" was not in the repo; bulk dates match this on-site export.

## Summary

| Action | Count |
|--------|------:|
| Locked booking overrides (STEP 1) | 12 refs |
| Paid invoices created/updated (locked totals) | 7 |
| Bulk `check_in_date` / `check_out_date` updates (STEP 2) | 119 |
| Cancellations (soft) | 4 (`00903` duplicate + 3 audit cancellations) |
| Missing refs from xlsx | 0 (all 131 refs exist; incl. `WOOF-2026-01287`) |
| Unparseable dates | 0 |

## Locked invoice totals (verified)

| Booking ref | Invoice | Status | Total (AED) |
|-------------|---------|--------|------------:|
| WOOF-2026-00641 | INV-2026-01913 | paid | **935.50** |
| WOOF-2026-00700 | INV-2026-01914 | paid | **180.50** |
| WOOF-2026-00709 | INV-2026-01915 | paid | **115.50** |
| WOOF-2026-00908 | INV-2026-01916 | paid | **115.50** |
| WOOF-2026-00835 | INV-2026-01917 | paid | **2,772.00** |
| WOOF-2026-00846 | INV-2026-01918 | paid | **1,386.00** |
| WOOF-2026-00904 | (new) | paid | **1,530.00** (boarding only; grooming TBD) |

## Cancellations / duplicate

| Ref | Booking status | Notes |
|-----|----------------|-------|
| WOOF-2026-00903 | `cancelled` | Duplicate — superseded by `WOOF-2026-00904` (not hard-deleted) |
| WOOF-2026-00925 | `cancelled` | Audit cancellation |
| WOOF-2026-00725 | `cancelled` | Audit cancellation |
| WOOF-2026-00831 | `cancelled` | Audit cancellation |

No invoices existed on the three audit cancellations or `00903` before run — void updates were no-ops.

## In-stay

| Ref | Status | Check-in | Check-out (planned) | Actual checkout |
|-----|--------|----------|---------------------|-----------------|
| WOOF-2026-00898 | `checked_in` | 2026-05-03 | 2026-06-03 | NULL — apply **double occupancy 15%** at checkout via `apply_double_occupancy_discount` |

## Artifacts in repo

- `sql/may23-25_audit_ingestion.sql` — full idempotent script (paste in SQL Editor to re-run)
- `sql/may23-25_audit_ingestion_txn.sql` — transaction body only
- `scripts/generate_may23_25_audit_sql.py` — regenerates SQL from xlsx
- `scripts/run_may_audit_invoices.py` — invoice upsert blocks (CROSS JOIN fix)
- `exports/may23-25_xlsx_refs.txt` — all refs from source sheet
- `exports/missing_refs.csv` — empty (header only; no missing refs)

## Cohort invoice sum (informational)

Bookings with `check_in_date` 2026-05-23..25 and `status <> cancelled`: **123** with linked invoice rows summing **2,288.00 AED** (most cohort bookings still have no invoice — pricing engine / checkout pending).

## Re-run / idempotency

Re-running `sql/may23-25_audit_ingestion.sql` in the SQL Editor is safe: invoice blocks delete line items then re-insert; inserts use `NOT EXISTS` on `booking_id`.

## Verification SQL

```sql
SELECT b.booking_ref, i.status, i.total
FROM bookings b
LEFT JOIN invoices i ON i.booking_id = b.id
WHERE b.booking_ref IN (
  'WOOF-2026-00641','WOOF-2026-00700','WOOF-2026-00709','WOOF-2026-00908',
  'WOOF-2026-00835','WOOF-2026-00846'
)
ORDER BY 1;

SELECT booking_ref, status, cancelled_reason FROM bookings WHERE booking_ref = 'WOOF-2026-00903';
```
