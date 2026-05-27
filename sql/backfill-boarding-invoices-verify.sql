-- Verification: boarding stays without a non-voided invoice
-- Run BEFORE and AFTER using the Boarding hub "Create missing invoices" action.

SELECT b.status, COUNT(*) AS stays_without_invoice
FROM bookings b
WHERE b.booking_type = 'boarding'
  AND b.status <> 'cancelled'
  AND b.owner_id IS NOT NULL
  AND b.check_out_date > b.check_in_date
  AND NOT EXISTS (
    SELECT 1
    FROM invoices i
    WHERE i.booking_id = b.id
      AND i.status <> 'voided'
  )
GROUP BY b.status
ORDER BY stays_without_invoice DESC;

-- Sample rows still missing (should be empty after backfill):
SELECT b.booking_ref, b.check_in_date, b.check_out_date, b.status
FROM bookings b
WHERE b.booking_type = 'boarding'
  AND b.status <> 'cancelled'
  AND b.owner_id IS NOT NULL
  AND b.check_out_date > b.check_in_date
  AND NOT EXISTS (
    SELECT 1
    FROM invoices i
    WHERE i.booking_id = b.id
      AND i.status <> 'voided'
  )
ORDER BY b.check_in_date DESC
LIMIT 25;
