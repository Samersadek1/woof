# Refactor ledger — safe-trim program

Branch: `refactor/safe-trim`  
Started: 2026-05-28

## Baseline (Phase 0)

| Suite | Result | Notes |
|-------|--------|-------|
| `npm run test:unit` | PASS | 126 tests (31 files) on branch start |
| `npm run test:db` | Partial | 59 pass / 10 fail — `is_peak_date` calendar boundary (env/migration); unrelated to refactor |
| Manual QA | Done (pre-refactor) | See [QA_FULL_RUN_2026-05-24.md](./QA_FULL_RUN_2026-05-24.md), [BOOKING_INVOICING_QA_FLOWS.md](./BOOKING_INVOICING_QA_FLOWS.md) |

Re-run after each behavior-adjacent PR: grooming appointment price prefill, boarding add-on prices, invoice line add, daycare day rate display.

## Canonical pricing surfaces (keep)

| Surface | Path | Data |
|---------|------|------|
| Grooming (v2) grid | `GroomingPricingGrid` | `service_rates` via `resolve_woof_service_rate` |
| Live rate card | `PricingTab` core | `service_rates` legacy display keys |
| Boarding peak calendar | `BoardingPeakPeriodsEditor` | peak periods + `boarding_night` seasons |
| Grooming packages (bundles) | `GroomingPackagesGrid` | `package_pricing` |
| Runtime resolver | `resolve_woof_service_rate` RPC | All new bookings/invoices |

## Removed in this program (admin UI)

- **Grooming Services (Legacy v1)** — duplicate of v2 grid + legacy rate-card keys
- **Grooming Rate Card (composite rows)** — same data as v2; edited only on Grooming (v2) tab
- **Daycare package add/edit** — threw on save; table is read-only with pointer to package purchase UI
- **`useBillingCalculator`** — zero imports

## Legacy keys — code references (audit)

| Key / pattern | Runtime? | File(s) | Action |
|---------------|----------|---------|--------|
| `grooming_grande_*` | Yes (addon map) | `addonPricing.ts` | Keep map until invoice history audited; resolves via RPC |
| `GROOMING_SERVICE_RATE_CARD_KEYS` | Admin only | was `Billing.tsx` | Removed with Legacy v1 UI |
| `groomingRates` / `useServiceRates` grooming query | Admin only | `useBilling.ts` | Removed grooming query |
| `boarding_addon_*` | Yes | `addonPricing.ts`, boarding form | Keep |
| `daycare_single_day` vs `daycare_full_day` | Yes | `Daycare.tsx`, `servicePricing.ts` | Display key vs RPC code — no change |

Run read-only SQL: [sql/legacy-grooming-audit.sql](../sql/legacy-grooming-audit.sql). Paste results below before any DB cleanup.

### Code audit (2026-05-28)

| Reference | Runtime | Notes |
|-----------|---------|-------|
| `grooming_grande_*` in `addonPricing.ts` | Yes | RPC via `legacyPricingKeyToServiceCode`; kept for invoices/boarding |
| `GROOMING_SERVICE_RATE_CARD_KEYS` | Was admin-only | Removed with Legacy v1 UI |
| `useServiceRates().groomingRates` | Was admin-only | Grooming query removed |
| `groomingRateCardRows` in PricingTab | Was admin-only | Removed; use Grooming (v2) |
| `resolve_woof_service_rate` | Yes | Canonical for appointments, boarding nights, addons |
| `daycare_single_day` display key | Yes | Mapped from `daycare_full_day` in Daycare page |

### DB audit results (Samer)

```
(paste Supabase SQL output from sql/legacy-grooming-audit.sql here)
```

## PR checklist

- [ ] One concern per commit/PR (extract OR delete OR tests)
- [ ] No `service_rates` mass updates in app PRs
- [ ] `npm run test:unit` green
- [ ] `npm run test:db` green (or known env failures documented)
- [ ] PR opened for E2E on grooming pricing spec
- [ ] Cowork review: “Did resolution logic change?”

## File moves

| Before | After |
|--------|-------|
| `PricingTab` in `Billing.tsx` | `src/pages/billing/pricing/PricingTab.tsx` |
| Duplicate billing `<Tabs>` | `src/pages/billing/BillingWorkspaceTabs.tsx` |
| Invoice rate fetch (×2) | `src/hooks/useInvoicePricingRows.ts` |
| `BoardingTransportRateHint` | `src/components/boarding/BoardingTransportRateHint.tsx` |
| `PetSafetyNotesBanner`, `VisitNotesField` | `src/components/grooming/` |
