-- INV-2026-04246 (Percy) — sync appointment + invoice to AED 315
UPDATE grooming_appointments
SET price = 315
WHERE id = '433c62eb-8a62-4084-8f5a-fb982b239882';

UPDATE invoice_line_items
SET unit_price = 315, total_price = 315, line_total = 315
WHERE invoice_id = 'f2137894-4c83-4bbb-b5be-e8fb0a8c406b'
  AND sort_order = 0;

UPDATE invoices
SET
  subtotal = 315,
  total = 315,
  vat_aed = round(315 - (315 / 1.05), 3),
  updated_at = now()
WHERE id = 'f2137894-4c83-4bbb-b5be-e8fb0a8c406b';

-- Verification
SELECT
  i.invoice_number,
  i.status,
  i.total,
  ga.price AS appt_price,
  ili.unit_price
FROM invoices i
JOIN grooming_appointments ga ON ga.id = i.service_id
JOIN invoice_line_items ili ON ili.invoice_id = i.id AND ili.sort_order = 0
WHERE i.invoice_number = 'INV-2026-04246';
