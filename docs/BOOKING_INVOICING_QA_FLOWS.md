# Booking to Invoicing QA Flows (Phase 2.5)

This checklist covers booking creation through invoicing, including assessment workflow and double-occupancy discount behavior.

## Scope

- Boarding booking creation to invoice generation
- Assessment booking creation to invoice generation
- Double-occupancy discount application and invoice recalculation
- Guardrails and validation failures (edge cases)

## Test Flows

### Flow 1: Assessment booking (happy path)

1. Open pet profile where `assessment_status = not_assessed`.
2. Click `Book Assessment`.
3. Select a valid future weekday and slot (`10:00` to `14:00`).
4. Confirm booking.
5. Verify:
   - success toast includes charge amount (`AED 52.50`)
   - pet status becomes `scheduled`
   - booking exists with `booking_type = assessment`
   - invoice exists with assessment line item amount `52.50`

### Flow 2: Assessment booking (validation edge cases)

1. Try booking on weekend.
2. Try booking invalid slot (for example `09:30`).
3. Verify each request is rejected with clear error message.

### Flow 3: Boarding single-pet booking to invoice

1. Create boarding booking with one pet.
2. Ensure invoice is created.
3. Verify:
   - no `double_occupancy_discount` adjustment exists
   - invoice totals remain unchanged by occupancy logic

### Flow 4: Boarding double-pet booking to invoice

1. Create boarding booking with two pets in same room.
2. Ensure invoice line items exist for boarding subtotal.
3. Trigger explicit discount application.
4. Verify:
   - billing adjustment row exists with type `double_occupancy_discount`
   - amount equals `15%` of boarding subtotal
   - invoice `discount_amount` and `total` are recalculated correctly

### Flow 5: Idempotency and downgrade edge case

1. Start with 2-pet booking (discount present).
2. Remove one pet from `booking_pets`.
3. Reapply discount logic.
4. Verify discount adjustment is removed and no stale discount remains.

### Flow 6: UI estimate consistency checks

In booking form estimate panel verify:

- `Subtotal` line is shown
- `Double occupancy 15% discount` line appears only when 2+ pets selected
- `Total` line reflects subtotal minus discount
- VAT line and gross total render consistently

## Executed Simulations (this run)

## DB Simulation Results

- Assessment happy path: PASS
  - booking + invoice + booking_pets link created
  - amount returned as `52.50`
  - pet moved to `scheduled`
- Assessment weekend rejection: PASS
- Assessment invalid slot rejection: PASS
- Single-pet boarding discount suppression: PASS
- Double-pet boarding discount apply: PASS
  - adjustment `-30.00` on subtotal `200.00`
  - invoice updated to `discount_amount=30.00`, `total=170.00`
- Occupancy drop below 2 removes discount: PASS
- Cleanup of all simulation fixtures: PASS

## UI Simulation Results

- Authentication and boarding entry: PASS
- Owner + two-pet selection: PASS
- Estimate panel double-occupancy hint: PASS
- End-to-end booking submission to invoice: BLOCKED
  - blocker: room selection in modal had no available options in dropdown, while UI text points to kennel grid selection path

## Edge Cases to Keep in Regression Suite

- Assessment on weekend and invalid slot must hard fail
- Assessment booking must be allowed even if pet is not passed
- Boarding/daycare bookings must still block non-passed pets
- Double-occupancy discount must only include boarding line items
- Reapplying discount must be idempotent (update existing adjustment, not duplicate)
- If pet count falls below 2, existing occupancy discount must be removed
- Invoice total recalculation must remain stable with multiple adjustments

## Notes

- Assessment bookings use `check_out_date = check_in_date + 1 day` to satisfy existing booking date constraint while still representing same-session logic via metadata.
- Occupancy discount requires `billing_adjustments.adjustment_type` to allow `double_occupancy_discount`.
