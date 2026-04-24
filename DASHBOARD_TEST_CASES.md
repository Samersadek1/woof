# Dashboard Test Cases (Exhaustive)

This document is the first section of the full platform QA suite and focuses on:
- Dashboard behavior and data integrity
- Dashboard outbound links and flow intent
- Calculation validations
- Pricing-related integrity checks reachable from Dashboard flows

## Scope

- Route: `/`
- Primary source file: `src/pages/DashboardPage.tsx`
- Key targets reached from Dashboard:
  - `src/pages/Boarding.tsx`
  - `src/pages/Daycare.tsx`
  - `src/pages/Park.tsx`
  - `src/pages/Grooming.tsx`
  - `src/pages/billing/InvoiceList.tsx`
  - `src/pages/Customers.tsx`
  - `src/pages/print/KennelCardsPrintPage.tsx`

## Test Data Setup (Reusable Fixtures)

- Owner A with 1 dog, no outstanding balance.
- Owner B with 2 dogs (for multi-pet downstream pricing validation).
- Owner C with low wallet balance (below threshold).
- At least:
  - 2 boarding check-ins today
  - 1 boarding check-out today
  - 2 daycare attendances today
  - 2 park visits today
  - 2 grooming appointments today
  - 1 overdue invoice
  - 1 outstanding invoice
  - 1 pet pending assessment
  - 1 pet with expired vaccination
  - 1 pet with soon-to-expire vaccination

## A. Access, Rendering, and Resilience

### DASH-001 Auth Redirect (Logged Out)
- Preconditions: No active session.
- Steps:
  1. Open `/`.
- Expected:
  - Redirect to `/login` (or setup-password flow for invite links).

### DASH-002 Dashboard Loads for Authenticated User
- Preconditions: Valid authenticated session.
- Steps:
  1. Open `/`.
- Expected:
  - All dashboard panels render without runtime errors.
  - Activity tiles, alerts, and schedule section are visible.

### DASH-003 Empty State Stability
- Preconditions: No records matching today/alerts.
- Steps:
  1. Open `/`.
- Expected:
  - Empty states appear cleanly.
  - No `null`, `undefined`, or `NaN` text appears.

### DASH-004 Partial Data Failure Isolation
- Preconditions: Simulate one failing dashboard query.
- Steps:
  1. Load dashboard with one data source failing.
- Expected:
  - Failed panel degrades gracefully.
  - Other panels still render and remain interactive.

## B. Activity Tile Calculation Correctness

### DASH-CALC-001 Boarding Check-ins Count
- Preconditions: Known check-in records for today.
- Steps:
  1. Note count on dashboard check-ins tile.
  2. Compare with source records for same day window.
- Expected:
  - Exact match.

### DASH-CALC-002 Boarding Check-outs Count
- Same method as DASH-CALC-001 for check-outs.

### DASH-CALC-003 Daycare Count
- Steps:
  1. Validate daycare tile count against today active daycare records.
- Expected:
  - Exact match.

### DASH-CALC-004 Park Count
- Steps:
  1. Validate park tile count against today park records.
- Expected:
  - Exact match.

### DASH-CALC-005 Grooming Count
- Steps:
  1. Validate grooming tile count against non-cancelled appointments for today.
- Expected:
  - Exact match.

### DASH-CALC-006 Assessments Needed Count
- Steps:
  1. Validate count against pets flagged as unassessed/pending by business rules.
- Expected:
  - Exact match, no false positives.

### DASH-CALC-007 Day Boundary Correctness
- Preconditions: Records around local midnight.
- Steps:
  1. Validate tile counts before and after day transition.
- Expected:
  - Counts move with local business day, no off-by-one date drift.

### DASH-CALC-008 Alert Counter Consistency
- Steps:
  1. Validate each alert number against direct record count from target domain.
- Expected:
  - Alert counters match actual records.

## C. Outbound Link Flow Verification (Route-Level)

### DASH-LINK-001 Check-ins Tile Link
- Steps:
  1. Click check-ins tile.
- Expected:
  - URL navigates to `/boarding?date=today&view=check-ins`.

### DASH-LINK-002 Check-outs Tile Link
- Expected URL: `/boarding?date=today&view=check-outs`.

### DASH-LINK-003 Daycare Tile Link
- Expected URL: `/daycare?date=today`.

### DASH-LINK-004 Park Tile Link
- Expected URL: `/park?date=today`.

### DASH-LINK-005 Grooming Tile Link
- Expected URL: `/grooming?date=today`.

### DASH-LINK-006 Assessment Tile Link
- Expected URL: `/park?date=today&type=assessment`.

### DASH-LINK-007 Print Today's Kennel Cards
- Steps:
  1. Click "Print today's kennel cards" (dashboard action).
- Expected:
  - New tab opens with `/print/kennel-cards?date=YYYY-MM-DD`.
  - Date is a concrete ISO date, not `today`.

### DASH-LINK-008 Overdue Invoice Alert Link
- Expected URL: `/billing/invoices?status=overdue`.

### DASH-LINK-009 Outstanding/Overdue Invoice Alert Link
- Expected URL: `/billing/invoices?status=outstanding,overdue`.

### DASH-LINK-010 Customer Filter Alert Links
- Expected URL patterns:
  - `/customers?filter=low-wallet`
  - `/customers?filter=unassessed`
  - `/customers?filter=vax-expired`
  - `/customers?filter=vax-expiring`

### DASH-LINK-011 Schedule Owner Link
- Expected URL: `/customers/:ownerId`.

### DASH-LINK-012 Schedule Pet Link
- Expected URL: `/customers/:ownerId/pets/:petId`.

## D. Link Intent Semantics (Behavior-Level)

These tests confirm target behavior matches the query/hash intent, not just that navigation occurs.

### DASH-SEM-001 Boarding Query Semantics
- Input link: `/boarding?date=today&view=check-ins`
- Expected:
  - Boarding opens with intended mode/date context applied.
- Observe and log:
  - Whether query params are currently ignored by target page.

### DASH-SEM-002 Grooming Date Semantics
- Input link: `/grooming?date=today`
- Expected:
  - Grooming day context resolves to today.
- Observe and log:
  - Whether non-ISO `today` token is ignored.

### DASH-SEM-003 Park Date and Type Semantics
- Input link: `/park?date=today&type=assessment`
- Expected:
  - Park date context and assessment mode intent are applied.
- Observe and log:
  - Whether date/type query are ignored by target page logic.

### DASH-SEM-004 Daycare Date Semantics
- Input link: `/daycare?date=today`
- Expected:
  - Date context is applied in downstream day-based views.
- Observe and log:
  - Whether `date` query has no effect.

### DASH-SEM-005 Invoice Status Prefilter Semantics
- Input link: `/billing/invoices?status=overdue`
- Expected:
  - Invoice list initializes with overdue filter active.

### DASH-SEM-006 Customer Filter Prefilter Semantics
- Input link: `/customers?filter=low-wallet`
- Expected:
  - Customers view initializes with low-wallet filter active.

## E. Dashboard -> Print Functional Checks

### DASH-PRINT-001 New Tab Behavior
- Steps:
  1. From dashboard, open kennel cards print.
  2. Return to original dashboard tab.
- Expected:
  - Dashboard tab remains stable and unchanged.

### DASH-PRINT-002 Date Propagation Accuracy
- Preconditions: Known active boarding records for chosen date.
- Steps:
  1. Trigger print route from dashboard.
  2. Compare printed list with expected bookings for that date.
- Expected:
  - Record set is exact for the propagated date.

### DASH-PRINT-003 Data Freshness
- Steps:
  1. Update one booking.
  2. Reopen print from dashboard.
- Expected:
  - Updated booking data appears in print output.

## F. Dashboard Calculations with Downstream Pricing Integrity

Dashboard does not compute service line prices directly, but it routes users into flows that do.
These checks ensure dashboard entry points do not lead to hardcoded or mismapped pricing behavior.

### DASH-PRICE-001 Dashboard -> Daycare (2 Dogs) Pricing Linkage
- Preconditions:
  - Owner with exactly 2 dogs in same daycare billing scenario.
  - Pricing table contains `daycare_2_dogs`.
- Steps:
  1. Enter daycare from dashboard flow.
  2. Create invoicing path for 2-dog daycare.
  3. Inspect generated invoice lines and pricing key/quantity behavior.
- Expected:
  - 2-dog scenario maps to canonical 2-dog pricing source.
  - No random hardcoded amount.
  - Line math matches configured pricing logic.

### DASH-PRICE-002 Dashboard -> Park (2 Dogs) Pricing Linkage
- Preconditions:
  - Owner with exactly 2 dogs.
  - Pricing table contains `park_2_dogs`.
- Steps:
  1. Enter park from dashboard flow.
  2. Execute park billing scenario for 2 dogs.
  3. Validate invoice/service line.
- Expected:
  - 2-dog park pricing links to 2-dog key logic, not single-dog x2 hardcode.

### DASH-PRICE-003 Dashboard -> Multi-Dog (4+) Escalation Logic
- Preconditions:
  - Owner with 4 dogs.
  - Pricing table includes base 3-dog and extra-dog pricing keys.
- Steps:
  1. Trigger daycare/park billing from dashboard path.
  2. Inspect final charge decomposition.
- Expected:
  - Total follows configured 3-dog base + extra-dog increment logic.
  - No flat hardcoded fallback replacing dynamic composition.

### DASH-PRICE-004 Dashboard -> Invoice Print Totals Integrity
- Steps:
  1. Start from dashboard alert to invoice list.
  2. Open invoice detail and print receipt flow.
  3. Validate subtotal/discount/VAT/grand total/paid/outstanding consistency.
- Expected:
  - All totals align with stored invoice values and payment history.
  - No unexplained constant amount injection.

### DASH-PRICE-005 Alert Threshold vs Price Constant Separation
- Steps:
  1. Validate low-wallet alert behavior near threshold values.
  2. Validate service invoice totals for same owners.
- Expected:
  - Alert threshold affects warning visibility only.
  - Service pricing remains sourced from canonical pricing logic.

## G. Negative and Regression Scenarios

### DASH-NEG-001 Broken Target Route Guard
- Steps:
  1. Tamper target URL manually from dashboard links.
- Expected:
  - Route guard / 404 behavior is safe and understandable.

### DASH-NEG-002 Rapid Repeated Clicks
- Steps:
  1. Double-click dashboard action links rapidly.
- Expected:
  - No duplicate destructive writes.
  - At worst, duplicate navigation or print tabs only.

### DASH-NEG-003 Back/Forward Browser Navigation
- Steps:
  1. Navigate dashboard -> target page -> back.
- Expected:
  - Dashboard restores cleanly without broken state.

### DASH-NEG-004 Limited Permission User
- Preconditions: Role with reduced access.
- Steps:
  1. Open dashboard and use links.
- Expected:
  - Restricted sections are hidden or blocked safely.

## Defect Logging Template (Use per failed test)

- Test ID:
- Environment:
- Preconditions:
- Actual result:
- Expected result:
- Evidence (URL/screenshot/record IDs):
- Severity:
- Suspected source file(s):

## Exit Criteria for Dashboard Sign-Off

- 100% pass for A/B/C sections.
- No P1/P2 failures in D/F sections.
- Any known semantic mismatches are logged with reproducible steps.
- Pricing-linkage checks prove no hardcoded arbitrary amounts for tested scenarios.
