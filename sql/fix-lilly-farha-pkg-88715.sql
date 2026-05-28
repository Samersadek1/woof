-- Lilly (pet) — Tania Farha owner — legacy invoice 88715
-- 12 half-day credits @ 567 AED gross (15% discount already in price, VAT inclusive)
-- Purchased 2025-11-21, no expiry
-- Authority usage: 10 dates (2 remaining)
--
-- Run in Supabase SQL editor. Samer runs SQL.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE notes LIKE '%tracker=PKG-88715%'
  ) THEN
    RAISE EXCEPTION 'Already applied (tracker=PKG-88715).';
  END IF;
END $$;

-- Invoice / purchase (receipt 88715)
INSERT INTO invoices (
  id, owner_id, issue_date, status,
  subtotal, subtotal_aed, total, total_aed, vat_aed,
  discount_pct, payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  'c15d6e7b-7904-4285-8912-a9c3be8dc8b6',
  'f48c6022-008e-49a3-b6e0-4789b891f6fb',
  '2025-11-21',
  'paid',
  567.0, 567.0, 567.0, 567.0, 27.0,
  15.0,
  'bank_transfer',
  'package',
  'Legacy daycare package purchase | tracker=PKG-88715 | receipt=88715 | raw_type=12 Half Day | pet=Lilly | discount_pct=15 gross_inclusive | no_expiry | authority:lilly_pkg_88715',
  '2025-11-21 12:00:00+00',
  567.0
);

INSERT INTO purchase_groups (
  id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied
) VALUES (
  '3f2465c8-6092-4dab-b904-cf08174cbb8a',
  'f48c6022-008e-49a3-b6e0-4789b891f6fb',
  'c15d6e7b-7904-4285-8912-a9c3be8dc8b6',
  '68b46040-3916-483f-bda1-63befb1ce1c6',
  1,
  0
);

INSERT INTO invoice_line_items (
  invoice_id, description, quantity, unit_price, total_price, line_total, service_type
) VALUES (
  'c15d6e7b-7904-4285-8912-a9c3be8dc8b6',
  '12 Half Daycare Day — Lilly (PKG-88715)',
  1,
  567.0,
  567.0,
  567.0,
  'package'
);

INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '49160001-9898-48e3-ab49-126d4cac7b88',
  'bf0c8ca1-aff0-4389-953e-a325306049db',
  'daycare_half_day',
  12,
  10,
  '2099-12-31',
  'package_purchase',
  'c15d6e7b-7904-4285-8912-a9c3be8dc8b6',
  '3f2465c8-6092-4dab-b904-cf08174cbb8a',
  false,
  'active',
  '2025-11-21 00:00:00+00'
);

INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES
  (
    '46378d75-f737-40d1-ab50-6f9b148a79c3',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2025-11-21',
    true,
    'tracker=PKG-88715 | slot=U1 | pet=Lilly | date_raw=21-Nov-2025 | authority:lilly_pkg_88715',
    '2025-11-21 09:00:00+00'
  ),
  (
    'a516f742-6715-4df0-b95f-047e708e18f3',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2025-12-09',
    true,
    'tracker=PKG-88715 | slot=U2 | pet=Lilly | date_raw=9-Dec-2025 | authority:lilly_pkg_88715',
    '2025-12-09 09:00:00+00'
  ),
  (
    '500940ae-a6ec-4a10-833f-24edd4e0e8ef',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2025-12-22',
    true,
    'tracker=PKG-88715 | slot=U3 | pet=Lilly | date_raw=22-Dec-2025 | authority:lilly_pkg_88715',
    '2025-12-22 09:00:00+00'
  ),
  (
    'affcec92-f386-4816-b9c1-b8f787430730',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2025-12-23',
    true,
    'tracker=PKG-88715 | slot=U4 | pet=Lilly | date_raw=23-Dec-2025 | authority:lilly_pkg_88715',
    '2025-12-23 09:00:00+00'
  ),
  (
    '7d9db93d-5435-4ef5-a222-7043414dd9ea',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2025-12-24',
    true,
    'tracker=PKG-88715 | slot=U5 | pet=Lilly | date_raw=24-Dec-2025 | authority:lilly_pkg_88715',
    '2025-12-24 09:00:00+00'
  ),
  (
    'dc8a0a7e-1fca-472b-90a8-3f6e714f6a30',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2025-12-26',
    true,
    'tracker=PKG-88715 | slot=U6 | pet=Lilly | date_raw=26-Dec-2025 | authority:lilly_pkg_88715',
    '2025-12-26 09:00:00+00'
  ),
  (
    '241b80fa-7dd3-4e0c-bb6c-9b9357a85eb4',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2026-01-31',
    true,
    'tracker=PKG-88715 | slot=U7 | pet=Lilly | date_raw=31-Jan-2026 | authority:lilly_pkg_88715',
    '2026-01-31 09:00:00+00'
  ),
  (
    '689b8052-9e63-4977-b82c-627bb7140744',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2026-02-24',
    true,
    'tracker=PKG-88715 | slot=U8 | pet=Lilly | date_raw=24-Feb-2026 | authority:lilly_pkg_88715',
    '2026-02-24 09:00:00+00'
  ),
  (
    'ba6e6bb2-6ce7-40cc-b0de-bddaa66a54f4',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2026-03-04',
    true,
    'tracker=PKG-88715 | slot=U9 | pet=Lilly | date_raw=4-Mar-2026 | authority:lilly_pkg_88715',
    '2026-03-04 09:00:00+00'
  ),
  (
    '994db7b1-cc22-43c1-b6d8-8c76e9315404',
    'f48c6022-008e-49a3-b6e0-4789b891f6fb',
    'bf0c8ca1-aff0-4389-953e-a325306049db',
    '49160001-9898-48e3-ab49-126d4cac7b88',
    '2026-03-16',
    true,
    'tracker=PKG-88715 | slot=U10 | pet=Lilly | date_raw=16-Mar-2026 | authority:lilly_pkg_88715',
    '2026-03-16 09:00:00+00'
  );

COMMIT;

-- Verification
SELECT
  o.first_name || ' ' || o.last_name AS owner,
  p.name AS pet,
  i.issue_date,
  i.total_aed,
  i.discount_pct,
  sc.units_total,
  sc.units_consumed,
  sc.units_total - sc.units_consumed AS remaining,
  sc.expires_at,
  sc.status,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS sessions
FROM invoices i
JOIN purchase_groups pg ON pg.invoice_id = i.id
JOIN service_credits sc ON sc.purchase_group_id = pg.id
JOIN pets p ON p.id = sc.pet_id
JOIN owners o ON o.id = p.owner_id
WHERE i.notes LIKE '%tracker=PKG-88715%';

SELECT ds.session_date, ds.notes
FROM daycare_sessions ds
WHERE ds.package_id = '49160001-9898-48e3-ab49-126d4cac7b88'
ORDER BY ds.session_date;
