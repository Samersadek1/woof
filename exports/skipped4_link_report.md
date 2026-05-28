# Skipped 4 — manual link report (read-only)

**Authority:** `exports/WOOF_Daycare_Package_Tracker_Simple.xlsx`  
**Match method:** `owners.source_external_id` / `pets.source_external_id` from **MatchedClientID** / **MatchedPetIDs**, then `service_credits` via `purchase_groups` + `package_definitions` (by package name → `code`). **Not** `tracker=` in invoice notes.

**Split rule (for proposed apply):** `units_total = TotalOfficialUnits ÷ pet_count`, `units_consumed = UsageCount ÷ pet_count`, odd remainder → first credit by `created_at`.

---

## 1. `PKG-84262-84380` — Pepe Sameni & Bobby Chamard

| Field | Value |
|-------|--------|
| **Sheet client** | Pepe Sameni & Bobby Chamard |
| **Match status (sheet)** | **Ambiguous** — CL000987 (Bobby / Mailys Chamard) \| CL001015 (Pepe / Shervin Sameni) |
| **Package (sheet)** | 30 Day Ticket ×2 → **TotalOfficialUnits 60**, **UsageCount 45** |
| **Pets (sheet)** | Parsed: Pepe Sameni / Bobby (2 pets) |
| **Per-pet target (apply)** | total **30, 30** · consumed **23, 22** (remainder on first) |

### Resolved owner / pets (from sheet IDs)

| Role | Legacy ID | DB `owner_id` | DB name |
|------|-----------|---------------|---------|
| Candidate A | CL000987 | `bb753a25-282f-48ff-80f8-d860b1463a42` | Mailys Chamard |
| Candidate B | CL001015 | `ae86f9c7-0ea0-4ad9-b3c4-3e15eb60fd2e` | Shervin Sameni |
| Pet Bobby (CL000987-P01) | | `028e18a5-3258-4101-a6f2-8477f9546136` | Bobby |
| Pet Pepe (CL001015-P01) | | `12774ed9-d0de-4e3f-8466-b94185aaee4a` | Pepe |

**No `thirty_day_ticket` credits** on CL000987-P01 or CL001015-P01.

### Credits actually in DB (package + tracker cross-check)

Migration merged this purchase under **synthetic household** `SYN-CL-0025` (Chamard Chamard):

| `credit_id` | Pet | `pet_id` | Current total/consumed | Invoice tracker | Issue date |
|-------------|-----|----------|------------------------|-----------------|------------|
| `5729a11a-22c7-44a2-9e51-f4cf0422e9aa` | Pepe Sameni | `b451afb5-517a-408b-b379-ce63d7bd03a3` | **30 / 22** | `PKG-84262-84380` | 2026-05-23 |
| `e8e20dbd-bf7b-440f-adfb-4a2801b46e76` | Bobby | `6813ee07-79b9-4810-8f64-e409bc9c7989` | **30 / 22** | `PKG-84262-84380` | 2026-05-23 |

- **Owner_id (credits):** `28a50165-38e2-41ae-abd7-973dfb3bbe22` (`SYN-CL-0025`)
- **Rollup today:** 60 / **44** (authority consumed **45** — off by 1)
- **Proposed apply:** Pepe Sameni → **30 / 23**, Bobby → **30 / 22** (order by `created_at`; both share same timestamp — confirm Pepe-first is acceptable)

**Recommendation:** Balance-correct the two existing credits on the synthetic owner. Do **not** move pets to CL000987/CL001015 unless you want a data-model change. Confirm synthetic owner is the intended link.

---

## 2. `PKG-73254-76624-76864` — Charlie Wahbe / Harlie

| Field | Value |
|-------|--------|
| **Sheet client** | Charlie Wahbe |
| **Match status (sheet)** | Likely — **CL001126** / pet **Harlie** (`CL001126-P01`) |
| **Package (sheet)** | Montly Madness (26 units) — **no matching `package_definitions` row** (no “madness” / monthly SKU in DB) |
| **Authority** | **TotalOfficialUnits 26**, **UsageCount 26** |
| **Per-pet target** | **26 / 26** (1 pet) |

### Resolved owner / pet

| | Legacy ID | DB id | Name |
|--|-----------|-------|------|
| Owner | CL001126 | `3d2c5006-6c16-49b4-b47e-260f2f46cde0` | Kseniza Zegarac |
| Pet | CL001126-P01 | `ae8ed16e-3d88-4aff-ac9b-be4f3be6e9fb` | Harlie |

### Matching `service_credits`

**None found** — no credits for Harlie / CL001126 on any package code (including `custom_daycare`, `units_total = 26`).

**Recommendation:** **Do not create a credit.** Manual decision: import missing purchase or map “Montly Madness” to a catalog SKU first. Sessions may exist without a credit row.

---

## 3. `PKG-Invoice-Pebbles-T-…-unpaid-xlsx` — Pebbles T / Lucky Seven

| Field | Value |
|-------|--------|
| **Sheet client** | Pebbles T |
| **Match status (sheet)** | Likely — **CL000584** / **Pebbles** (`CL000584-P01`) |
| **Package (sheet)** | Lucky Seven (`lucky_7`) |
| **Authority** | **TotalOfficialUnits 7**, **UsageCount 1** (date 2026-02-11) |
| **Payment (sheet)** | Unpaid draft |
| **Per-pet target** | **7 / 1** |

### Resolved owner / pet

| | Legacy ID | DB id | Name |
|--|-----------|-------|------|
| Owner | CL000584 | `440a6647-974b-4c59-8851-89c15ca7ce52` | Audroni Tikniute |
| Pet | CL000584-P01 | `0e5c17ea-a1e9-4f13-b41b-549ffa26a020` | Pebbles |

### Matching `service_credits` (`lucky_7`, same issue date)

| `credit_id` | total/consumed | Tracker | Invoice status | Notes |
|-------------|----------------|---------|----------------|-------|
| `e934ccb5-eaaa-4e74-aa33-e7a1fbcc54e6` | **7 / 7** | `PKG-90857` | paid | Same date 2026-02-11 — fully used |
| `bd60be82-6c61-4535-b930-c10ce294ca65` | **7 / 1** | *(none)* | **cancelled** | “Voided from owner profile” |

**No credit** with tracker `PKG-Invoice-Pebbles-T-…` or an active unpaid invoice.

**Recommendation:** **No apply** — likely never generated (unpaid). The **paid** `PKG-90857` row already covers 7/7 on 2026-02-11; the cancelled row looks like a voided duplicate. Confirm with staff whether the unpaid file is duplicate of 90857 or a separate purchase.

---

## 4. `PKG-Invoice-Lotus-Meimei-Rocky-Kronfol-…-upaid-xlsx` — Kronfol 3-pet 30-day

| Field | Value |
|-------|--------|
| **Sheet client** | Lotus, Meimei & Rocky Kronfol |
| **Match status (sheet)** | Auto — **CL000284** / 3 pets |
| **Package (sheet)** | 30 Day Ticket (`thirty_day_ticket`) |
| **Authority** | **TotalOfficialUnits 90**, **UsageCount 0** (sheet; 0 usage dates) |
| **Per-pet target** | **30 / 0** each (3 pets) |

### Resolved owner / pets

| Pet | Legacy ID | DB `pet_id` |
|-----|-----------|-------------|
| Owner CL000284 | | `9d625d7c-d7f2-42f7-8198-03fa42b381ae` (Tamima Kronfol) |
| Lotus | CL000284-P01 | `31d18899-4867-4524-bfdc-35069e33436e` |
| Mei Mei | CL000284-P02 | `bbc628cd-394a-4bcd-84c1-4f34d5047de8` |
| Rocky | CL000284-P03 | `02389f3b-03e2-4385-a95d-cf515d946653` |

### Matching `service_credits` (already have this tracker on invoice notes)

| `credit_id` | Pet | Current | Proposed |
|-------------|-----|---------|----------|
| `7c29d7af-59b1-4f11-90ef-cca31b1fcf31` | Lotus | **10 / 1** | **30 / 0** |
| `f7b407ea-84c2-40f3-9ddd-2f223fa0848d` | Mei Mei | **10 / 1** | **30 / 0** |
| `b00c1546-6046-4bfa-b1aa-87a8d56cf053` | Rocky | **10 / 1** | **30 / 0** |

- Issue date **2026-05-23**, invoice status **paid** (title says “upaid” — likely filename only)
- Values look like per-pet allowance (10) was stored instead of **90÷3 = 30**; consumed **1** each vs authority **0**

**Recommendation:** **Apply** balance correction on these three credits only (no new credit). Optionally add `tracker=` to notes if missing — already present.

---

## Apply summary (after you confirm)

| Tracker | Action |
|---------|--------|
| `PKG-84262-84380` | Update **2** credits (synthetic owner) → 30/23 + 30/22 |
| `PKG-73254-76624-76864` | **Skip** — no credit in DB |
| `PKG-Invoice-Pebbles-T-…` | **Skip** — no linkable active credit |
| `PKG-Invoice-Lotus-Meimei-Rocky-…` | Update **3** credits → 30/0 each |

## Applied (2026-05-27)

**5 credits updated** via `exports/skipped4_sync_apply.sql`. Audit: `exports/skipped4_sync_audit.csv`.

| Tracker | Result |
|---------|--------|
| `PKG-84262-84380` | Pepe **30/23**, Bobby **30/22** (rollup 60/45) |
| `PKG-Invoice-Lotus-Meimei-Rocky-…` | Lotus, Mei Mei, Rocky each **30/0** (rollup 90/0) |
| `PKG-73254-76624-76864` | Skipped — no credit |
| `PKG-Invoice-Pebbles-T-…` | Skipped — no linkable credit |
