# Woof Migration Generators — `migration/scripts/`

Python scripts that turn the source XLSX into SQL/JSON files for the Woof
Supabase project (`wineliuwejkxwsdbrthb`).

These scripts produced the live data on 2026-05-23 / 2026-05-24. They
incorporate all the fixes learned during real execution. **If the migration
ever needs to be re-run, use these scripts — not the SQL output files on
their own — because the source XLSX may have changed.**

---

## Files

| Script | Produces | Phases |
|---|---|---|
| `build_phase01.py` | `woof_phase0_wipe.sql`, `woof_phase1_payload.json`, `woof_phase1_call.sql`, `woof_phase1_room_check.sql` | 0, 1 |
| `build_phase234.py` | `woof_phase2_pets_update.sql`, `woof_phase3_vaccinations.sql`, `woof_phase4a_halfday_catalog.sql`, `woof_phase4b_packages.sql`, `woof_phase4c_daycare_sessions.sql` | 2, 3, 4a, 4b, 4c |
| `build_phase5f.py` | `sql/phase5/phase5f_recover_daycare_sessions.sql` | 5f (one-time recovery after 4c) |

Both scripts read from the patched XLSX (default
`/mnt/user-data/outputs/WOOF_System_Migration_Simple_PATCHED.xlsx`).
Update the `XLSX` constant at the top of each file if the source moves.

---

## Phase summary (in execution order)

| Phase | What runs | How |
|---|---|---|
| 0 | TRUNCATE transactional tables; drop test rooms; backfill `rooms.source_external_id` | SQL in Supabase editor |
| 1 | `do_legacy_import_atomic` RPC for owners + pets + rooms + bookings + booking_pets + booking_room_assignments | psql / supabase CLI (~1.2 MB JSON payload, too large for the editor) |
| 2 | `UPDATE pets SET size='medium', assessment_status='passed'` | SQL editor |
| 3 | Insert ~2,400 vaccination rows | SQL editor |
| 4a | Add `daycare_half_day` to `service_code` enum + insert `six_half_day_dcare` catalog row | **Two separate `supabase db query` calls** — enum value must commit before it can be used |
| 4b | 246 daycare packages → invoices + line items + purchase_groups + service_credits | SQL editor |
| 4c | ~3,800 daycare_sessions from historical usage | SQL editor |

---

## Fixes incorporated (learned the hard way during execution)

### `build_phase01.py`

| # | Fix | Why |
|---|---|---|
| 1 | Room `source_external_id` is `ROOM-{name}` (e.g. `ROOM-A1`) | Existing rooms in the DB use the `ROOM-` prefix on `room_number`; sending bare names creates duplicate rows that all booking_room_assignments then point to |
| 2 | `EMIT_EXCLUSIVE_END_DATE` toggle (default `False`) for booking_room_assignment spans | Woof's `check_dates` constraint requires `end_date > start_date` (exclusive convention). The first migration emitted INCLUSIVE end_dates; single-day spans got bumped at import to satisfy the constraint, multi-day spans were not. Toggle `True` only if verification confirms multi-day stays are showing 1 day short in the UI |

### `build_phase234.py`

| # | Fix | Why |
|---|---|---|
| 3 | `CASE WHEN…END` cast with `::invoice_status` | Postgres rejects bare text literals when the column type is the `invoice_status` enum |
| 4 | Don't join via `invoice_number` after the invoices INSERT | The `set_invoice_number` BEFORE INSERT trigger overwrites the staged value with `INV-2026-NNNNN`, so the original number is no longer present to match on |
| 5 | Join via `notes LIKE 'Legacy daycare package purchase \| tracker=X \|%'` (with the trailing ` \|%` boundary) | The notes field stores the source tracker; the ` \|` sentinel prevents prefix collisions like `PKG-93219` matching `PKG-93219-93263` |
| 6 | `service_credits.source_type = 'package_purchase'` | The CHECK constraint on `source_type` rejects `'legacy_migration'`; `package_purchase` is the allowed value for credits originating from a package purchase |
| 7 | Synthetic `LEGACY-{tracker_id}` invoice numbers for NULL-invoice packages | Prevents cartesian doubling in service_credits when the same owner had multiple NULL-invoice packages of the same code (e.g. Loki Mouchantaf CL000232) |
| 8 | `units_consumed` set at INSERT time from source `UtilizedDays` (not computed post-hoc from session count) | Computing from sessions over-attributed when an owner had multiple same-code packages, since LEAST() was applied per row instead of allocating across rows |

### Half-day daycare catalog (4a)

| # | Fix | Why |
|---|---|---|
| 9 | `ALTER TYPE service_code ADD VALUE 'daycare_half_day'` runs OUTSIDE the BEGIN/COMMIT block | PG rejects use of an enum value within the same transaction it was added. Phase 4a is intentionally two transactions: enum add (auto-commits) then the catalog inserts |

---

## How to re-run from scratch (hypothetical)

1. Update the patched XLSX with any new corrections
2. Re-run `build_phase01.py` and `build_phase234.py` to regenerate the SQL/JSON
3. Phase 0 wipe
4. Phase 1 RPC via psql:
   ```bash
   psql "$WOOF_DB_URL" -c "SELECT do_legacy_import_atomic($$$(cat woof_phase1_payload.json)$$$::jsonb);"
   ```
5. Phase 2, 3, 4a (two calls!), 4b, 4c in Supabase SQL editor

Each phase has a verification SELECT at the bottom — paste output into review before proceeding.

---

## Known limitations

- **496 daycare usage rows dropped** — staff shorthand dates like `Jan 20 WPT 184` that can't be parsed to an ISO date. They're permanently lost unless re-parsed manually.
- **4 packages had NULL invoice numbers in source** — synthesized as `LEGACY-{tracker_id}` and flagged with `NO_SOURCE_INVOICE | NEEDS_INVOICE_REVIEW` in the invoice notes for staff cleanup.
- **11 packages over-utilized in source** — `UtilizedDays > IncludedDays`. Capped at `IncludedDays` via `LEAST()` in the credit allocation; the historical informal extension isn't represented.
- **Monthly Madness package skipped** — 1 row, per migration directive.
- **Multi-pet packages distribute credits evenly** — e.g. `A/F/R 6 Half Day Package` with 54 IncludedDays across 3 pets gives each pet `floor(54/3) = 18` credits. Remainder (if any) is unallocated.

---

## Source data location

Patched XLSX (with merges, name cleanups, size defaults, vaccination parsing) lives at:

```
outputs/woof_migration/WOOF_System_Migration_Simple_PATCHED.xlsx
```

Patches were applied via separate scripts (`apply_patch_v3.py`, `apply_patch_v4.py`, `parse_vacc_dates.py`) which are pre-migration data cleanup, not migration generation. If those need to re-run, restore them too.
