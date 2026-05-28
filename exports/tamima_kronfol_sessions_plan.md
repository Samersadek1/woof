# Tamima Kronfol — session re-link plan (Phase 3, not executed)

**Status:** For staff review only. Do not run without explicit approval.

## Problem

[`tamima_kronfol_authority_vs_db.csv`](tamima_kronfol_authority_vs_db.csv) shows **18 / 24** credits with `sessions_mismatch`:

- Credit balances (`units_total` / `units_consumed`) already match the authority xlsx.
- Each mismatched credit has **30** `daycare_sessions` rows linked via `package_id`, while authority `units_consumed` is **12–14** (or **0** for the May 2026 package).

This pattern matches prior `over_used` reconciliation: sessions were bulk-attached per credit while consumed counters were corrected later.

## May 2026 package (priority)

**Tracker:** `PKG-Invoice-Lotus-Meimei-Rocky-Kronfol-…-May-23-2026-packages-upaid-xlsx`

| Credit | Pet | Auth consumed | DB sessions |
|--------|-----|--------------:|------------:|
| `7c29d7af-…` | Lotus | 0 | 1 on **2026-05-26** (`bb3616e4-…`) |
| `f7b407ea-…` | Mei Mei | 0 | 1 on 2026-05-26 |
| `b00c1546-…` | Rocky | 0 | 1 on 2026-05-26 |

Authority file shows **0** usage for this purchase. Options (pick one after staff confirm):

1. **Unlink** sessions (`package_id = NULL`) and bill path from notes if visit was real.
2. **Re-assign** `package_id` to the correct older PKG-##### credit if May 26 should consume an earlier ticket.
3. **Delete** sessions only if they were logged in error (requires audit log / staff sign-off).

## Historical PKG-##### packages (PKG-84539 … PKG-91175)

- Authority **Usage Detail** has **30 rows per package** (10 per pet label), but **Per Pet Packages** shows **12–14 consumed per pet** depending on package.
- DB has **30 session rows per credit** — likely many sessions belong on a different tracker’s credit for the same pet.

### Recommended approach (high level)

1. Export `daycare_sessions` for owner `9d625d7c-…` where `package_id` is any of the 24 credit IDs (date, pet, session id, current package_id).
2. For each package, map **Usage Detail** `InferredDate` + `PetFromActivity` to the intended tracker (from xlsx).
3. Re-home `package_id` to match authority package for that date, **without** changing `units_consumed` until session sets align.
4. After re-home, verify `COUNT(sessions per credit) <= units_consumed` per pet (or equals if 1:1 policy).
5. Trim or unlink surplus sessions only with staff approval.

### Out of scope for automated fix

- Merging or voiding duplicate PKG-84539…PKG-92359 invoices (separate real purchases per tax invoice PDFs in the xlsx).
- Changing invoice totals or payments.

## Next step

Confirm with Samer whether May 26 visits should attach to the **May 23** package or an **older** ticket, then run a dedicated session SQL script (separate from credit balance fix).
