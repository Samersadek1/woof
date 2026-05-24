# Full QA Run — 24 May 2026

Environment: local against Supabase project in `.env.test`, Playwright on `http://localhost:8091`.

## Access & auth

| Item | Result | Notes |
|------|--------|-------|
| E2E admin user | **PASS** | `e2e-admin@woof.test` created/confirmed via `global-setup.ts`; staff row upserted when `staff` table exists |
| Playwright storage state | **PASS** | `tests/e2e/.auth/admin.json` |
| Logged-out redirect | **PASS** | `/` → `/login` (route-smoke) |
| Production login | Not tested | Requires real staff credentials |

## Automated test summary

| Suite | Result | Count |
|-------|--------|------:|
| DB (Vitest) | **PASS** | 67 |
| Unit (Vitest) | **PASS** | 18 |
| E2E (Playwright) | **PASS** | 8 (incl. new route-smoke) |
| `npm run build` | **PASS** | — |
| `npm run lint` | **PASS** | — |

## E2E business flows (invoice / package / booking impact)

| Flow | Result | Invoice / billing check |
|------|--------|-------------------------|
| New client wizard | **PASS** | Owner + pet created |
| Boarding 2-pet + double occupancy | **PASS** | Invoice linked; `double_occupancy_discount` adjustment created |
| Package purchase (six_full_service, 2 pets) | **PASS** | Subtotal/discount/total UI; `service_credits` + invoice via RPC |
| Daycare credit consumption | **PASS** | Invoice with AED 0 covered line; credit debited |
| Owner aggregate credits UI | **PASS** | Active package balances shown |
| Assessment booking (DB) | **PASS** | AED 52.50 invoice; weekend/slot validation |
| Package purchase RPC (DB) | **PASS** | lucky_7, multi-pet discount, thirty_day_ticket, purchase_group → invoice |
| Double occupancy RPC (DB) | **PASS** | Calculate/apply/idempotent/remove |

## Route smoke (UI)

All primary routes load without runtime errors: dashboard, customers, boarding, daycare, grooming, billing, invoices (incl. filters), staff, profile, settings, vets, rooms, agent, service check-ins, deep links with query params.

| Route | Result |
|-------|--------|
| `/park` | **Expected 404** — park module removed from router; dashboard no longer links to park |

## Defects found and disposition

### Fixed in this run

1. **Grooming — React maximum update depth** (P1)  
   - Cause: `useEffect` depending on unstable `searchParams` object; credit-prefill effect always returned new state object.  
   - Fix: `dateParam` primitive dependency; only update `useCreditByPet` when values change.  
   - Files: `src/pages/Grooming.tsx`

2. **Invoice list — console 400 on missing `invoices`→`branches` FK** (P2)  
   - Cause: Primary query embedded `branches(code)`; PostgREST PGRST200, then fallback (worked but logged 400).  
   - Fix: Use owner join only; derive branch from invoice number.  
   - Files: `src/hooks/useInvoices.ts`

3. **Invoice list / customers — unstable `searchParams` in effects** (P3)  
   - Fix: Depend on primitive query param strings; avoid redundant `setStatus` updates.  
   - Files: `src/pages/billing/InvoiceList.tsx`, `src/pages/Customers.tsx`

### Logged — not fixed (low priority)

| ID | Severity | Issue | Recommendation |
|----|----------|-------|----------------|
| QA-DBG-01 | — | Debug ingest removed from `App.tsx`, `SetupPasswordPage.tsx`, `useBookings.ts` | **Resolved** |
| QA-ROUTE-01 | — | `/park` removed; `DASHBOARD_TEST_CASES.md` updated | **Resolved** |
| QA-MIG-01 | — | `fix_package_invoice_totals_aed_columns` applied to remote | **Resolved** (see migration history) |

## Booking → invoice checklist (`BOOKING_INVOICING_QA_FLOWS.md`)

| Flow | DB | UI |
|------|----|-----|
| Assessment happy path | PASS | Not in E2E (manual/pet profile) |
| Assessment validation | PASS | Not in E2E |
| Single-pet boarding (no discount) | PASS | Covered indirectly |
| Double-pet boarding + discount | PASS | **PASS** (E2E) |
| Discount idempotency / removal | PASS | Not in E2E |
| UI estimate panel | Not automated | Manual |

Previous blocker (“room dropdown empty”) is **not reproduced** in current E2E: room search by number works in `02-boarding-double-occupancy.spec.ts`.

## Regression assets added

- `tests/e2e/00-route-smoke.spec.ts` — auth redirect, 19 authenticated routes, park 404

## Sign-off

- **Core billing/booking/package paths: PASS** (DB + E2E).  
- **UI shell / navigation: PASS** (route-smoke).  
- **Build/lint: PASS**.  
- Remaining gaps: assessment UI E2E, dashboard tile count accuracy vs fixtures, debug ingest cleanup, optional branches FK migration for invoice branch codes.
