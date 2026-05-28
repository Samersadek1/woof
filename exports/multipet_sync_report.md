# Multi-pet package sync report

**Date:** 2026-05-28  
**Authority:** `exports/WOOF_Daycare_Package_Tracker_Simple.xlsx` (247 rows, sheet Package Tracker)  
**Scope:** `service_credits.units_total` / `units_consumed` only — **daycare_sessions not modified**

## Stage 2 — applied

Split rule (per credit, ordered by `created_at`):

| Field | Formula |
|-------|---------|
| `units_total` | `TotalOfficialUnits ÷ pet_count` (remainder to first credit) |
| `units_consumed` | `UsageCount ÷ pet_count` (remainder to first credit) |

**Not** `OfficialUnitsPerPackage` (package-level per-pet allowance in the sheet).

- **Credits updated:** 82 (idempotent `UPDATE … WHERE IS DISTINCT FROM`)
- **SQL:** `exports/multipet_sync_apply.sql` (executed via Supabase MCP in two `BEGIN…COMMIT` batches)
- **Audit log:** `exports/multipet_sync_audit.csv`

### Skipped (manual linking required)

| Tracker | Reason |
|---------|--------|
| `PKG-84262-84380` | No resolvable credits |
| `PKG-73254-76624-76864` | No resolvable credits |
| `PKG-Invoice-Pebbles-T-Tax-Invoice-pebbles-t-Feb-11-2026-package-unpaid-xlsx` | Filename tracker, no credit |
| `PKG-Invoice-Lotus-Meimei-Rocky-Kronfol-Tax-Invoice-Lotus-Meimei-Rocky-Kronfol-May-23-2026-packages-upaid-xlsx` | Filename tracker, no credit |

## Verification (post-apply)

| Check | Result |
|-------|--------|
| Package rollups vs tracker (`Σ units_total`, `Σ units_consumed`) | **0 mismatches** (243 packages with credits) |
| Per-credit split vs `TotalOfficialUnits/pet_count` & `UsageCount/pet_count` | **0 mismatches** |
| Multi-pet packages with mismatch (excl. skipped) | **0** |
| Credits with negative remaining (`units_total - units_consumed < 0`) | **0** |

## Stage 1 preview (post-apply)

Regenerated: `exports/multipet_sync_preview.csv`

| Verdict | Count |
|---------|------:|
| match | 243 |
| skipped | 4 |
| no_credit | 0 |
| both_wrong / total_wrong / consumed_wrong | 0 |

**Multi-pet mismatch count (excluding 4 skipped): 0**

## Examples (multi-pet, now aligned)

- **PKG-92359** (Lotus / Mei Mei / Rocky): tracker 90 total / 90 used → **30 + 30 + 30** per credit (was 10 each pre-sync)
- **PKG-90306** (Honey): 30 total / 29 used on single credit

## Notes

- Re-running `multipet_sync_apply.sql` is safe (no-op where values already match).
- Remaining reconciliation items outside this run: orphan sessions, over-used credits vs session counts, duplicate tracker investigation — see `exports/credit_session_reconciliation.csv` and `exports/duplicate_tracker_audit.csv`.
