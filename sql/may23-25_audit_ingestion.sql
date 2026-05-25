-- May 23–25 2026 audit ingestion (generated; idempotent)
-- Project: wineliuwejkxwsdbrthb — Samer: run entire file in SQL Editor
BEGIN;

CREATE TEMP TABLE IF NOT EXISTS _may_audit_bulk (
  booking_ref TEXT PRIMARY KEY,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL
) ON COMMIT DROP;
TRUNCATE _may_audit_bulk;
INSERT INTO _may_audit_bulk (booking_ref, check_in, check_out) VALUES
  ('WOOF-2026-00894', '2026-04-30', '2026-05-24'),
  ('WOOF-2026-00802', '2026-05-20', '2026-05-25'),
  ('WOOF-2026-00774', '2026-05-22', '2026-05-25'),
  ('WOOF-2026-00862', '2026-05-22', '2026-05-24'),
  ('WOOF-2026-00616', '2026-05-23', '2026-05-25'),
  ('WOOF-2026-00636', '2026-05-23', '2026-05-24'),
  ('WOOF-2026-00650', '2026-05-23', '2026-05-25'),
  ('WOOF-2026-00681', '2026-05-23', '2026-05-24'),
  ('WOOF-2026-00697', '2026-05-23', '2026-05-24'),
  ('WOOF-2026-00735', '2026-05-23', '2026-05-24'),
  ('WOOF-2026-00736', '2026-05-23', '2026-05-24'),
  ('WOOF-2026-00805', '2026-05-23', '2026-05-24'),
  ('WOOF-2026-00666', '2026-05-20', '2026-05-28'),
  ('WOOF-2026-00678', '2026-05-21', '2026-06-01'),
  ('WOOF-2026-00688', '2026-05-21', '2026-05-24'),
  ('WOOF-2026-00758', '2026-05-22', '2026-05-24'),
  ('WOOF-2026-00807', '2026-05-22', '2026-05-31'),
  ('WOOF-2026-00914', '2026-05-22', '2026-05-29'),
  ('WOOF-2026-00647', '2026-05-23', '2026-05-30'),
  ('WOOF-2026-00605', '2026-03-28', '2026-06-25'),
  ('WOOF-2026-00897', '2026-05-03', '2026-06-03'),
  ('WOOF-2026-00698', '2026-05-08', '2026-06-01'),
  ('WOOF-2026-00820', '2026-05-08', '2026-06-09'),
  ('WOOF-2026-00713', '2026-05-11', '2026-06-16'),
  ('WOOF-2026-00910', '2026-05-11', '2026-06-02'),
  ('WOOF-2026-00644', '2026-05-12', '2026-06-01'),
  ('WOOF-2026-00915', '2026-05-12', '2026-06-02'),
  ('WOOF-2026-00722', '2026-05-13', '2026-05-31'),
  ('WOOF-2026-00827', '2026-05-14', '2026-05-29'),
  ('WOOF-2026-00633', '2026-05-17', '2026-05-31'),
  ('WOOF-2026-00705', '2026-05-19', '2026-05-27'),
  ('WOOF-2026-00866', '2026-05-19', '2026-06-08'),
  ('WOOF-2026-00889', '2026-05-19', '2026-05-26'),
  ('WOOF-2026-00919', '2026-05-19', '2026-06-02'),
  ('WOOF-2026-00620', '2026-05-20', '2026-06-01'),
  ('WOOF-2026-00667', '2026-05-20', '2026-06-06'),
  ('WOOF-2026-00754', '2026-05-20', '2026-06-02'),
  ('WOOF-2026-00836', '2026-05-20', '2026-06-01'),
  ('WOOF-2026-00877', '2026-05-20', '2026-05-31'),
  ('WOOF-2026-00902', '2026-05-20', '2026-05-31'),
  ('WOOF-2026-00924', '2026-05-20', '2026-05-24'),
  ('WOOF-2026-00926', '2026-05-20', '2026-06-01'),
  ('WOOF-2026-00612', '2026-05-21', '2026-06-08'),
  ('WOOF-2026-00653', '2026-05-21', '2026-05-31'),
  ('WOOF-2026-00669', '2026-05-21', '2026-05-28'),
  ('WOOF-2026-00671', '2026-05-21', '2026-05-31'),
  ('WOOF-2026-00677', '2026-05-21', '2026-06-01'),
  ('WOOF-2026-00715', '2026-05-21', '2026-05-30'),
  ('WOOF-2026-00716', '2026-05-21', '2026-06-03'),
  ('WOOF-2026-00720', '2026-05-21', '2026-06-01'),
  ('WOOF-2026-00727', '2026-05-21', '2026-05-31'),
  ('WOOF-2026-00729', '2026-05-21', '2026-05-29'),
  ('WOOF-2026-00747', '2026-05-21', '2026-05-31'),
  ('WOOF-2026-00764', '2026-05-21', '2026-06-01'),
  ('WOOF-2026-00773', '2026-05-21', '2026-05-30'),
  ('WOOF-2026-00780', '2026-05-21', '2026-05-29'),
  ('WOOF-2026-00814', '2026-05-21', '2026-05-29'),
  ('WOOF-2026-00874', '2026-05-21', '2026-05-30'),
  ('WOOF-2026-00892', '2026-05-21', '2026-06-08'),
  ('WOOF-2026-00896', '2026-05-21', '2026-05-28'),
  ('WOOF-2026-00899', '2026-05-21', '2026-05-31'),
  ('WOOF-2026-00905', '2026-05-21', '2026-06-01'),
  ('WOOF-2026-00918', '2026-05-21', '2026-05-29'),
  ('WOOF-2026-00640', '2026-05-22', '2026-05-28'),
  ('WOOF-2026-00679', '2026-05-22', '2026-05-31'),
  ('WOOF-2026-00777', '2026-05-22', '2026-06-01'),
  ('WOOF-2026-00810', '2026-05-22', '2026-06-02'),
  ('WOOF-2026-00816', '2026-05-22', '2026-05-30'),
  ('WOOF-2026-00830', '2026-05-22', '2026-05-27'),
  ('WOOF-2026-00855', '2026-05-22', '2026-06-08'),
  ('WOOF-2026-00858', '2026-05-22', '2026-05-24'),
  ('WOOF-2026-00873', '2026-05-22', '2026-06-08'),
  ('WOOF-2026-00883', '2026-05-22', '2026-06-08'),
  ('WOOF-2026-00922', '2026-05-22', '2026-05-30'),
  ('WOOF-2026-00615', '2026-05-23', '2026-05-28'),
  ('WOOF-2026-00646', '2026-05-23', '2026-05-30'),
  ('WOOF-2026-00687', '2026-05-23', '2026-05-30'),
  ('WOOF-2026-00692', '2026-05-23', '2026-05-31'),
  ('WOOF-2026-00695', '2026-05-23', '2026-05-25'),
  ('WOOF-2026-00704', '2026-05-23', '2026-05-30'),
  ('WOOF-2026-00760', '2026-05-23', '2026-05-26'),
  ('WOOF-2026-00767', '2026-05-23', '2026-05-31'),
  ('WOOF-2026-00795', '2026-05-23', '2026-05-30'),
  ('WOOF-2026-00821', '2026-05-23', '2026-05-31'),
  ('WOOF-2026-00839', '2026-05-23', '2026-06-01'),
  ('WOOF-2026-00841', '2026-05-23', '2026-05-31'),
  ('WOOF-2026-00852', '2026-05-23', '2026-05-28'),
  ('WOOF-2026-00871', '2026-05-23', '2026-05-26'),
  ('WOOF-2026-00885', '2026-05-23', '2026-05-31'),
  ('WOOF-2026-00895', '2026-05-23', '2026-05-30'),
  ('WOOF-2026-00901', '2026-05-23', '2026-06-01'),
  ('WOOF-2026-00912', '2026-05-23', '2026-05-31'),
  ('WOOF-2026-00917', '2026-05-23', '2026-05-28'),
  ('WOOF-2026-00920', '2026-05-23', '2026-05-30'),
  ('WOOF-2026-00652', '2026-05-24', '2026-05-26'),
  ('WOOF-2026-00703', '2026-05-24', '2026-05-31'),
  ('WOOF-2026-00870', '2026-05-24', '2026-06-01'),
  ('WOOF-2026-00876', '2026-05-24', '2026-05-26'),
  ('WOOF-2026-00927', '2026-05-24', '2026-06-01'),
  ('WOOF-2026-00635', '2026-05-25', '2026-06-02'),
  ('WOOF-2026-00643', '2026-05-25', '2026-05-30'),
  ('WOOF-2026-00655', '2026-05-25', '2026-05-31'),
  ('WOOF-2026-00706', '2026-05-25', '2026-06-01'),
  ('WOOF-2026-00708', '2026-05-25', '2026-05-30'),
  ('WOOF-2026-00750', '2026-05-25', '2026-06-01'),
  ('WOOF-2026-00772', '2026-05-25', '2026-05-29'),
  ('WOOF-2026-00811', '2026-05-25', '2026-06-01'),
  ('WOOF-2026-00817', '2026-05-25', '2026-05-26'),
  ('WOOF-2026-00842', '2026-05-25', '2026-05-31'),
  ('WOOF-2026-00859', '2026-05-25', '2026-06-01'),
  ('WOOF-2026-00882', '2026-05-25', '2026-05-29'),
  ('WOOF-2026-01287', '2026-05-25', '2026-05-29'),
  ('WOOF-2026-00785', '2026-05-26', '2026-06-01');

-- === STEP 1: Locked overrides ===


UPDATE bookings SET
  check_in_date = '2026-05-16'::date,
  check_out_date = '2026-05-24'::date,
  actual_check_in_at = ('2026-05-16 08:00:00+04')::timestamptz,
  actual_check_out_at = ('2026-05-24 08:00:00+04')::timestamptz,
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00641';


UPDATE bookings SET
  check_in_date = '2026-05-23'::date,
  check_out_date = '2026-05-24'::date,
  actual_check_in_at = ('2026-05-23 08:00:00+04')::timestamptz,
  actual_check_out_at = ('2026-05-24 08:00:00+04')::timestamptz,
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00700';


UPDATE bookings SET
  check_in_date = '2026-05-23'::date,
  check_out_date = '2026-05-24'::date,
  actual_check_in_at = ('2026-05-23 08:00:00+04')::timestamptz,
  actual_check_out_at = ('2026-05-24 08:00:00+04')::timestamptz,
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00709';


UPDATE bookings SET
  check_in_date = '2026-05-23'::date,
  check_out_date = '2026-05-24'::date,
  actual_check_in_at = ('2026-05-23 08:00:00+04')::timestamptz,
  actual_check_out_at = ('2026-05-24 08:00:00+04')::timestamptz,
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00908';


UPDATE bookings SET
  check_in_date = '2026-05-25'::date,
  check_out_date = '2026-06-03'::date,
  actual_check_in_at = ('2026-05-25 08:00:00+04')::timestamptz,
  actual_check_out_at = ('2026-06-03 08:00:00+04')::timestamptz,
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00904';


UPDATE bookings SET
  check_in_date = '2026-05-20'::date,
  check_out_date = '2026-06-01'::date,
  actual_check_in_at = ('2026-05-20 08:00:00+04')::timestamptz,
  actual_check_out_at = ('2026-06-01 08:00:00+04')::timestamptz,
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00835';


UPDATE bookings SET
  check_in_date = '2026-05-20'::date,
  check_out_date = '2026-06-01'::date,
  actual_check_in_at = ('2026-05-20 08:00:00+04')::timestamptz,
  actual_check_out_at = ('2026-06-01 08:00:00+04')::timestamptz,
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00846';


UPDATE bookings SET
  check_in_date = '2026-05-03'::date,
  check_out_date = '2026-06-03'::date,
  actual_check_in_at = ('2026-05-03 08:00:00+04')::timestamptz,
  actual_check_out_at = NULL,
  status = 'checked_in',
  notes = COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END
    || 'may23-25 audit: in-stay; apply double occupancy 15% at checkout via apply_double_occupancy_discount RPC.',
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00898';


UPDATE bookings SET
  status = 'cancelled',
  cancelled_reason = 'Cancelled per May 23–25 audit',
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00925';

UPDATE invoices i SET
  status = 'voided',
  voided_at = COALESCE(voided_at, NOW()),
  voided_reason = COALESCE(voided_reason, 'Cancelled per May 23–25 audit'),
  updated_at = NOW()
FROM bookings b
WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00925';


UPDATE bookings SET
  status = 'cancelled',
  cancelled_reason = 'Cancelled per May 23–25 audit',
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00725';

UPDATE invoices i SET
  status = 'voided',
  voided_at = COALESCE(voided_at, NOW()),
  voided_reason = COALESCE(voided_reason, 'Cancelled per May 23–25 audit'),
  updated_at = NOW()
FROM bookings b
WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00725';


UPDATE bookings SET
  status = 'cancelled',
  cancelled_reason = 'Cancelled per May 23–25 audit',
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00831';

UPDATE invoices i SET
  status = 'voided',
  voided_at = COALESCE(voided_at, NOW()),
  voided_reason = COALESCE(voided_reason, 'Cancelled per May 23–25 audit'),
  updated_at = NOW()
FROM bookings b
WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00831';


UPDATE bookings SET
  status = 'cancelled',
  cancelled_reason = 'Duplicate entry — superseded by WOOF-2026-00904 (may23-25 audit)',
  updated_at = NOW()
WHERE booking_ref = 'WOOF-2026-00903';

UPDATE invoices i SET
  status = 'voided',
  voided_at = COALESCE(voided_at, NOW()),
  voided_reason = COALESCE(voided_reason, 'Duplicate entry — superseded by WOOF-2026-00904 (may23-25 audit)'),
  updated_at = NOW()
FROM bookings b
WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00903';


INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at, notes
)
SELECT
  b.owner_id, b.id, 'boarding', '2026-05-24'::date, 'paid',
  935.50, 935.50, 0, 0, 0.00,
  935.50, 935.50, 935.50, NOW(), 'TC 10% noted but waived'
FROM bookings b
WHERE b.booking_ref = 'WOOF-2026-00641'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid', issue_date = '2026-05-24'::date,
  subtotal = 935.50, subtotal_aed = 935.50,
  discount_pct = 0.00, total = 935.50, total_aed = 935.50,
  amount_paid = 935.50, paid_at = COALESCE(paid_at, NOW()), notes = 'TC 10% noted but waived',
  updated_at = NOW()
FROM bookings b WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00641';

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00641';

INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES
  (0, 'Off-peak boarding (7 nights @ 115.50)', 'boarding_night', 7, 115.50, 808.50, 808.50),
  (1, 'Peak boarding (1 night @ 127.50)', 'boarding_night', 1, 127.50, 127.50, 127.50),
  (2, 'Adjustment / write-off', NULL, 1, -0.50, -0.50, -0.50)
) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = 'WOOF-2026-00641';


INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at
)
SELECT
  b.owner_id, b.id, 'boarding', '2026-05-24'::date, 'paid',
  180.50, 180.50, 0, 0, 0.00,
  180.50, 180.50, 180.50, NOW()
FROM bookings b
WHERE b.booking_ref = 'WOOF-2026-00700'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid', issue_date = '2026-05-24'::date,
  subtotal = 180.50, subtotal_aed = 180.50,
  discount_pct = 0.00, total = 180.50, total_aed = 180.50,
  amount_paid = 180.50, paid_at = COALESCE(paid_at, NOW()),
  updated_at = NOW()
FROM bookings b WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00700';

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00700';

INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES
  (0, 'Boarding (1 night @ 115.50)', 'boarding_night', 1, 115.50, 115.50, 115.50),
  (1, 'Retail purchase — item unspecified by staff', NULL, 1, 65.00, 65.00, 65.00)
) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = 'WOOF-2026-00700';


INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at
)
SELECT
  b.owner_id, b.id, 'boarding', '2026-05-24'::date, 'paid',
  115.50, 115.50, 0, 0, 0.00,
  115.50, 115.50, 115.50, NOW()
FROM bookings b
WHERE b.booking_ref = 'WOOF-2026-00709'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid', issue_date = '2026-05-24'::date,
  subtotal = 115.50, subtotal_aed = 115.50,
  discount_pct = 0.00, total = 115.50, total_aed = 115.50,
  amount_paid = 115.50, paid_at = COALESCE(paid_at, NOW()),
  updated_at = NOW()
FROM bookings b WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00709';

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00709';

INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES
  (0, 'Boarding (1 night @ 115.50)', 'boarding_night', 1, 115.50, 115.50, 115.50)
) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = 'WOOF-2026-00709';


INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at
)
SELECT
  b.owner_id, b.id, 'boarding', '2026-05-24'::date, 'paid',
  115.50, 115.50, 0, 0, 0.00,
  115.50, 115.50, 115.50, NOW()
FROM bookings b
WHERE b.booking_ref = 'WOOF-2026-00908'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid', issue_date = '2026-05-24'::date,
  subtotal = 115.50, subtotal_aed = 115.50,
  discount_pct = 0.00, total = 115.50, total_aed = 115.50,
  amount_paid = 115.50, paid_at = COALESCE(paid_at, NOW()),
  updated_at = NOW()
FROM bookings b WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00908';

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00908';

INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES
  (0, 'Boarding (1 night @ 115.50)', 'boarding_night', 1, 115.50, 115.50, 115.50)
) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = 'WOOF-2026-00908';


INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at, notes
)
SELECT
  b.owner_id, b.id, 'boarding', '2026-06-01'::date, 'paid',
  2772.00, 2772.00, 0, 0, 0.00,
  2772.00, 2772.00, 2772.00, NOW(), 'Shared room with WOOF-2026-00846 (Cody, Savannah / Sushi) — operational only, no discount'
FROM bookings b
WHERE b.booking_ref = 'WOOF-2026-00835'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid', issue_date = '2026-06-01'::date,
  subtotal = 2772.00, subtotal_aed = 2772.00,
  discount_pct = 0.00, total = 2772.00, total_aed = 2772.00,
  amount_paid = 2772.00, paid_at = COALESCE(paid_at, NOW()), notes = 'Shared room with WOOF-2026-00846 (Cody, Savannah / Sushi) — operational only, no discount',
  updated_at = NOW()
FROM bookings b WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00835';

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00835';

INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES
  (0, 'Boarding — 2 dogs × 115.50/night × 12 nights', 'boarding_night', 24, 115.50, 2772.00, 2772.00)
) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = 'WOOF-2026-00835';


INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at, notes
)
SELECT
  b.owner_id, b.id, 'boarding', '2026-06-01'::date, 'paid',
  1386.00, 1386.00, 0, 0, 0.00,
  1386.00, 1386.00, 1386.00, NOW(), 'Shared room with WOOF-2026-00835 — operational only, no discount'
FROM bookings b
WHERE b.booking_ref = 'WOOF-2026-00846'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid', issue_date = '2026-06-01'::date,
  subtotal = 1386.00, subtotal_aed = 1386.00,
  discount_pct = 0.00, total = 1386.00, total_aed = 1386.00,
  amount_paid = 1386.00, paid_at = COALESCE(paid_at, NOW()), notes = 'Shared room with WOOF-2026-00835 — operational only, no discount',
  updated_at = NOW()
FROM bookings b WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00846';

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00846';

INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES
  (0, 'Boarding — 1 dog × 115.50/night × 12 nights', 'boarding_night', 12, 115.50, 1386.00, 1386.00)
) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = 'WOOF-2026-00846';


INSERT INTO invoices (
  owner_id, booking_id, service_type, issue_date, status,
  subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
  total, total_aed, amount_paid, paid_at, notes
)
SELECT
  b.owner_id, b.id, 'boarding', '2026-06-03'::date, 'paid',
  1530.00, 1530.00, 0, 0, 0.00,
  1530.00, 1530.00, 1530.00, NOW(), 'Manual review — grooming charge missing on training package'
FROM bookings b
WHERE b.booking_ref = 'WOOF-2026-00904'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id);

UPDATE invoices i SET
  status = 'paid', issue_date = '2026-06-03'::date,
  subtotal = 1530.00, subtotal_aed = 1530.00,
  discount_pct = 0.00, total = 1530.00, total_aed = 1530.00,
  amount_paid = 1530.00, paid_at = COALESCE(paid_at, NOW()), notes = 'Manual review — grooming charge missing on training package',
  updated_at = NOW()
FROM bookings b WHERE i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00904';

DELETE FROM invoice_line_items li
USING invoices i, bookings b
WHERE li.invoice_id = i.id AND i.booking_id = b.id AND b.booking_ref = 'WOOF-2026-00904';

INSERT INTO invoice_line_items (invoice_id, description, pricing_key, quantity, unit_price, total_price, line_total, service_type, sort_order)
SELECT i.id, v.description, v.pricing_key, v.quantity, v.unit_price, v.total_price, v.line_total, 'boarding', v.ord
FROM bookings b
JOIN invoices i ON i.booking_id = b.id
CROSS JOIN (VALUES
  (0, 'Boarding/Training package — 170/night × 9 nights', 'boarding_night', 9, 170.00, 1530.00, 1530.00)
) AS v(ord, description, pricing_key, quantity, unit_price, total_price, line_total)
WHERE b.booking_ref = 'WOOF-2026-00904';


-- === STEP 2: Bulk date updates from woof_may23-25_invoice_audit.xlsx / Review Required (113 rows) ===
UPDATE bookings b SET
  check_in_date = v.check_in::date,
  check_out_date = v.check_out::date,
  updated_at = NOW()
FROM _may_audit_bulk v
WHERE b.booking_ref = v.booking_ref;

COMMIT;

-- === Verification ===

SELECT b.booking_ref, i.status, i.total
FROM bookings b
LEFT JOIN invoices i ON i.booking_id = b.id
WHERE b.booking_ref IN (
  'WOOF-2026-00641','WOOF-2026-00700','WOOF-2026-00709','WOOF-2026-00908',
  'WOOF-2026-00835','WOOF-2026-00846'
)
ORDER BY 1;

SELECT booking_ref, status, cancelled_reason FROM bookings WHERE booking_ref = 'WOOF-2026-00903';

SELECT b.booking_ref, i.status, i.voided_reason
FROM bookings b
LEFT JOIN invoices i ON i.booking_id = b.id
WHERE b.booking_ref IN ('WOOF-2026-00925','WOOF-2026-00725','WOOF-2026-00831');
