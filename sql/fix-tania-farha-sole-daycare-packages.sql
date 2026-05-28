-- Tania Farha sole daycare packages: purge all PKG daycare data for owner, rebuild from
-- ~/Downloads/Tania_Farha_Usage_View_1.xlsx (ONLY authority).
-- Safe to re-run (no idempotent guard). Stamps authority:tania_farha_usage_view_v1

-- Tania Farha (f48c6022-008e-49a3-b6e0-4789b891f6fb): delete + rebuild daycare packages
-- Authority: ~/Downloads/Tania_Farha_Usage_View_1.xlsx (Per Pet Import sheet ONLY)
-- Guard: authority:tania_farha_usage_view_v1

BEGIN;


DELETE FROM daycare_sessions ds
WHERE ds.package_id IN (
  SELECT sc.id FROM service_credits sc
  JOIN pets p ON p.id = sc.pet_id
  WHERE p.owner_id = 'f48c6022-008e-49a3-b6e0-4789b891f6fb'::uuid
    AND sc.service_code = 'daycare_half_day'
    AND sc.source_type = 'package_purchase'
);

DELETE FROM service_credits sc
USING pets p
WHERE sc.pet_id = p.id
  AND p.owner_id = 'f48c6022-008e-49a3-b6e0-4789b891f6fb'::uuid
  AND sc.service_code = 'daycare_half_day'
  AND sc.source_type = 'package_purchase';

DELETE FROM invoice_line_items ili
USING invoices i
WHERE ili.invoice_id = i.id
  AND i.owner_id = 'f48c6022-008e-49a3-b6e0-4789b891f6fb'::uuid
  AND i.notes LIKE '%tracker=PKG%';

DELETE FROM purchase_groups pg
USING invoices i
WHERE pg.invoice_id = i.id
  AND i.owner_id = 'f48c6022-008e-49a3-b6e0-4789b891f6fb'::uuid
  AND i.notes LIKE '%tracker=PKG%';

DELETE FROM invoices i
WHERE i.owner_id = 'f48c6022-008e-49a3-b6e0-4789b891f6fb'::uuid
  AND i.notes LIKE '%tracker=PKG%';

-- PKG-85435 invoice 85435
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  'f69f342e-b365-44d0-bb6c-06dd6495dab4', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '2025-07-22', 'paid',
  567.0, 567.0, 567.0, 567.0, 27.0,
  'bank_transfer', 'package',
  'Legacy daycare package purchase | tracker=PKG-85435 | raw_type=6 Half Daycare Day | import_id=PKG-85435-* | per_pet_from_usage_view | authority:tania_farha_usage_view_v1',
  '2025-07-22 12:00:00+00', 567.0
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('186ec8f8-6138-4abc-ab89-c9e7d0cdcef9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'f69f342e-b365-44d0-bb6c-06dd6495dab4', '68b46040-3916-483f-bda1-63befb1ce1c6', 1, 0);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('f69f342e-b365-44d0-bb6c-06dd6495dab4', '6 Half Daycare Day — Lilly (PKG-85435)', 1, 567.0, 567.0, 567.0, 'package');

-- PKG-85435-01 Lilly (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '76f7edcc-d809-4da1-8ead-76fcab9d762e', 'bf0c8ca1-aff0-4389-953e-a325306049db', 'daycare_half_day', 6, 6, '2026-01-22',
  'package_purchase', 'f69f342e-b365-44d0-bb6c-06dd6495dab4', '186ec8f8-6138-4abc-ab89-c9e7d0cdcef9', false, 'depleted', '2025-07-22 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '53802625-6c4c-56a6-8069-7e6c70a1f86d', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-07-29', true,
  'tracker=PKG-85435 | import_id=PKG-85435-01 | pet=Lilly | authority:tania_farha_usage_view_v1', '2025-07-29 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a3b221fa-c7f3-5d8a-95b2-47e539ba70d5', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-02', true,
  'tracker=PKG-85435 | import_id=PKG-85435-01 | pet=Lilly | authority:tania_farha_usage_view_v1', '2025-08-02 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '65535c70-a111-547d-a922-76f8a8fba7a9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-05', true,
  'tracker=PKG-85435 | import_id=PKG-85435-01 | pet=Lilly | authority:tania_farha_usage_view_v1', '2025-08-05 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '77b9f50b-37f1-50a9-a2dd-281b2e112c22', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-09', true,
  'tracker=PKG-85435 | import_id=PKG-85435-01 | pet=Lilly | authority:tania_farha_usage_view_v1', '2025-08-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f5268775-7289-5830-9290-e71db81e79ec', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-12', true,
  'tracker=PKG-85435 | import_id=PKG-85435-01 | pet=Lilly | authority:tania_farha_usage_view_v1', '2025-08-12 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '133a57cb-6069-59b2-a1f8-b96878d85e1b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-14', true,
  'tracker=PKG-85435 | import_id=PKG-85435-01 | pet=Lilly | authority:tania_farha_usage_view_v1', '2025-08-14 09:00:00+00'
);

-- PKG-87380 invoice 87380
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  '7282ecd5-6341-4022-bfea-9b9eb3b654b9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '2025-10-02', 'paid',
  2551.5, 2551.5, 2551.5, 2551.5, 121.5,
  'bank_transfer', 'package',
  'Legacy daycare package purchase | tracker=PKG-87380 | raw_type=R/A/F 6 half daycare day | import_id=PKG-87380-* | per_pet_from_usage_view | authority:tania_farha_usage_view_v1',
  '2025-10-02 12:00:00+00', 2551.5
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('72047016-eb4e-40fc-8238-b3480d62e2f2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '7282ecd5-6341-4022-bfea-9b9eb3b654b9', '68b46040-3916-483f-bda1-63befb1ce1c6', 3, 0);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('7282ecd5-6341-4022-bfea-9b9eb3b654b9', 'R/A/F 6 half daycare day — Alfie / Finley / Rumi (PKG-87380)', 1, 2551.5, 2551.5, 2551.5, 'package');

-- PKG-87380-01 Alfie (21/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '3e193691-9055-49fb-98f8-0dfdd875b478', 'daycare_half_day', 21, 21, '2026-04-02',
  'package_purchase', '7282ecd5-6341-4022-bfea-9b9eb3b654b9', '72047016-eb4e-40fc-8238-b3480d62e2f2', false, 'depleted', '2025-10-02 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b81a9722-1e8f-519a-b0d8-7fc971a8cc5b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-03', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-03 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '45a1b206-c5b8-554c-b69d-8f55a5de2a33', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-04', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '54ee6fed-7132-51d9-9af2-274e13cb7925', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-06', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'c6e0f9c3-f196-5dbf-9b70-978fac69aa6b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-07', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0c54bdaa-ab0f-59fc-b747-3534628da5b5', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-09', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b57cd257-8624-57d9-8d90-f9921a313ddd', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-10', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '8b69ce30-e6ef-55eb-acb2-5bc2267d68bf', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-11', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6963a806-44fb-52ee-93a7-a41d1e0eebea', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-14', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '62206d95-74f1-5322-bfa9-6d6e31d66535', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-16', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e201cd20-a47a-5220-b509-fdc0271599d4', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-17', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-17 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '5aca2e06-f056-53da-8dfd-87f8314a8450', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-18', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-18 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a54486e6-4f23-5977-a5b8-26e7b382c63e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-20', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6d188293-81c0-5a34-83b3-6c7dabbabb10', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-21', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'fb2bafb8-49aa-5fad-b1e1-38e58a03d6be', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-23', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-23 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '5861abe7-29ed-527d-a5e9-f11d09048b3c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-24', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-24 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3ee14d6b-4007-598f-8272-0d36e1dc9885', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-25', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-25 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '61ba3606-6127-5895-a48d-802f3bd9a1e4', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-31', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-10-31 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b1ecf335-e6ef-5ec7-8dc9-cc9439c3a5d2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-11-08', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-11-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '26157b40-b10a-526b-ab37-49033f57df33', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-11-10', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-11-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '19c39557-4128-594e-9528-f8b8cdfdd00c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-11-15', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-11-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3a678047-e8fc-5b64-a479-1364e7c19551', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-11-18', true,
  'tracker=PKG-87380 | import_id=PKG-87380-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2025-11-18 09:00:00+00'
);

-- PKG-87380-02 Finley (21/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '44f2855d-4b30-4474-96f4-7455400099a8', '11059926-7a1b-403e-b058-38c3e133d37d', 'daycare_half_day', 21, 21, '2026-04-02',
  'package_purchase', '7282ecd5-6341-4022-bfea-9b9eb3b654b9', '72047016-eb4e-40fc-8238-b3480d62e2f2', false, 'depleted', '2025-10-02 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b8041505-8fb5-5296-b67b-b1a77c2c1080', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-03', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-03 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '298693ca-ebd8-58ce-a1cf-274e74db7cca', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-04', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0149b530-2f59-56ea-b9c0-e33b458e26d0', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-06', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6fe8293f-ab93-552b-822d-fe33af22b4c6', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-07', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '1cfa6ce0-4341-5f00-b269-0fee88ed0d1a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-09', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b24431f3-9514-5022-a5c9-2b414d08a9ff', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-10', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '91362410-a88b-568a-9527-cdaa7b666e5a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-11', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0029405c-e63c-547b-8a35-ad256837d95d', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-14', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b2602a46-4c07-5960-8c3f-a0fb8368b5b2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-16', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '2a992b1f-f31a-549f-b36d-c1b701848cf1', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-17', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-17 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'eb1babfb-d211-5219-a9ee-34ed9e00900b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-18', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-18 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '26583013-ea60-5807-aba2-a23ccae5e02b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-20', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6343f804-7c55-55a5-b539-0326ca3c2582', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-21', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'dec6e142-4b30-54c1-9cba-4b6497159591', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-23', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-23 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f9583743-5c60-589e-a24d-c1dfd163a1df', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-24', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-24 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd4a71dfd-0384-524e-9346-0b1e74110745', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-25', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-25 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '45e8653a-8c23-50c9-8848-57c0cd784ce3', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-31', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-10-31 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '13f7b976-dd8e-5939-8447-3ae6d6b39892', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-11-08', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-11-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b67bb42a-1478-5879-ba68-0cf63c739a5f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-11-10', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-11-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a3183c65-9019-5f2f-b7a5-42076c1e049e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-11-15', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-11-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '17a0719c-de28-5a37-a64b-800d46e40633', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-11-18', true,
  'tracker=PKG-87380 | import_id=PKG-87380-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2025-11-18 09:00:00+00'
);

-- PKG-87380-03 Rumi (21/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'daycare_half_day', 21, 21, '2026-04-02',
  'package_purchase', '7282ecd5-6341-4022-bfea-9b9eb3b654b9', '72047016-eb4e-40fc-8238-b3480d62e2f2', false, 'depleted', '2025-10-02 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '07edd14f-121f-5873-8629-8edd74cd68b5', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-03', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-03 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '86c3ba7c-b4ef-53ef-b2a5-2c99719344bf', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-04', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '2aab9ca1-192d-5e0e-af47-791c575d9088', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-06', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '021fcdb5-777f-5eb2-8d9c-286435ca09a7', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-07', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '5aafdd12-9010-5be5-91eb-993665020db5', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-09', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0fd6f7ec-c9ca-5f5c-ad3d-16e927addedc', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-10', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '769693f1-0c32-5466-843a-4f0cf1aa9737', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-11', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e1851d84-4dd0-520d-9b05-24cff4b24240', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-14', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '5b4df967-49b9-5f28-9b41-a7712ad09e5a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-16', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a1880f9e-a004-5e1c-90d8-5423282d06c3', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-17', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-17 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '7a94eb1e-9dcf-5583-87d5-9795779202a6', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-18', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-18 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '728c4787-3d9a-53b2-b5d5-d2954af35e04', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-20', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'bb2fda3a-99fa-5dac-bdf5-6c82912a6606', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-21', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '63a17014-0871-5a15-a63e-2fd6a5e2dea8', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-23', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-23 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'edc3390f-4c54-5d7b-96fb-61b4230a98de', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-24', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-24 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd3241c5d-9c77-5b70-91b3-ef2ca9d532bd', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-25', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-25 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '8dc74ed3-2ccb-5b8b-82f0-1390aab58915', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-31', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-10-31 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e05f84b8-375c-5a82-90e3-24c76407a9a5', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-11-08', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-11-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3cd92985-7ba2-596d-822e-82daa761f8dc', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-11-10', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-11-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '551ef366-69e9-5ce8-88e8-db65e8b37a14', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-11-15', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-11-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b584f7da-d36a-57a1-9289-274344491d2a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-11-18', true,
  'tracker=PKG-87380 | import_id=PKG-87380-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2025-11-18 09:00:00+00'
);

-- PKG-92236 invoice 92236
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  'fd6269f0-b500-40cf-a198-101d79e778b2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '2026-04-09', 'paid',
  2551.5, 2551.5, 2551.5, 2551.5, 121.5,
  'bank_transfer', 'package',
  'Legacy daycare package purchase | tracker=PKG-92236 | raw_type=A/F/R 6 Half Day Package | import_id=PKG-92236-* | per_pet_from_usage_view | authority:tania_farha_usage_view_v1',
  '2026-04-09 12:00:00+00', 2551.5
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('039c0387-d1d1-4e53-aa29-9b269dc78530', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'fd6269f0-b500-40cf-a198-101d79e778b2', '68b46040-3916-483f-bda1-63befb1ce1c6', 3, 0);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('fd6269f0-b500-40cf-a198-101d79e778b2', 'A/F/R 6 Half Day Package — Alfie / Finley / Rumi (PKG-92236)', 1, 2551.5, 2551.5, 2551.5, 'package');

-- PKG-92236-01 Alfie (21/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '3e193691-9055-49fb-98f8-0dfdd875b478', 'daycare_half_day', 21, 21, '2026-10-09',
  'package_purchase', 'fd6269f0-b500-40cf-a198-101d79e778b2', '039c0387-d1d1-4e53-aa29-9b269dc78530', false, 'depleted', '2026-04-09 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'ccb108dd-db06-5c71-a607-af67015b8a07', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-11', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f5574520-2bbe-5d67-b941-a74a5dd9866c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-09', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '94d580b5-27fb-52bc-b7f2-6eddb5635da0', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-10', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3cb089d2-be83-533e-acc4-2d5cfd4e23a0', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-11', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd9a46850-68ff-5bc9-98a4-f5f434b00f93', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-14', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6d11a494-c92d-5ef9-a6c1-633c6eae3fb9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-16', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3f4dd654-68e3-51c5-873a-188c61d578c8', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-12', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-12 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'feec2f65-a646-5a47-a0e7-1371ede84f4b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-20', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '458e53c5-5aa3-51c8-9f95-126b442ecbcc', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-21', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6e3d17eb-5002-5ba2-815e-6b70f3c1f649', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-23', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-23 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'ab3003cd-275e-507c-9a35-9de923875741', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-25', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-25 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '071249f7-8001-54f5-9c22-35bac525a773', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-27', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-27 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '1448b9f4-59d0-54a7-832a-428afd701f38', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-30', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-04-30 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '328826ac-7056-5b2f-91f9-55890f3a7b43', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-01', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-01 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'bb62e99f-823b-571e-b186-2f5cdc9160b9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-02', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-02 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '5b09adb1-3f44-53d6-8901-bee70935afba', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-04', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'be62117f-5ced-5110-ade8-f9d423ddacb8', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-05', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-05 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3e5413d3-6def-50a4-8325-b27b8ccf6779', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-06', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '95b2fd5d-ded0-5960-8b97-81fa3a8e99b2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-07', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a4d6c096-d569-5652-a69a-619768c46421', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-08', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e67be38e-d963-5cba-9e8f-a4a26fa2774b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-05-09', true,
  'tracker=PKG-92236 | import_id=PKG-92236-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-09 09:00:00+00'
);

-- PKG-92236-02 Finley (21/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '11059926-7a1b-403e-b058-38c3e133d37d', 'daycare_half_day', 21, 21, '2026-10-09',
  'package_purchase', 'fd6269f0-b500-40cf-a198-101d79e778b2', '039c0387-d1d1-4e53-aa29-9b269dc78530', false, 'depleted', '2026-04-09 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0ee83136-8b7d-5051-9274-ea7a399f97f6', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-08', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '67473a65-0ac9-553c-9f2e-24bbf60c653e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-09', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e0c1c3c0-fda4-5188-8c6d-6c0a9510ff31', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-10', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '4f30aa13-4b90-556e-86c2-983b882f1224', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-11', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0fb39c88-aa62-5bf3-879d-391dbdb48e89', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-14', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6008764a-edea-5e8f-a413-d19d4bd30ba8', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-16', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '52c60105-bd2d-5455-a745-32e514e1f949', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-17', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-17 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '56cc9b2c-aa8e-5a02-8524-313d6f652811', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-20', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '083b3f45-26af-5cbf-81f4-3e089e53e8dc', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-21', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '4d5f9df1-e468-59c0-b47c-a84d16b94f3b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-23', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-23 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a3e5bfa3-7493-5cf3-9c02-8407577e736c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-25', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-25 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '58734274-5846-59e7-9589-bc1ce4f55973', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-27', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-27 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '81baa109-eb7c-5550-aa57-e935dee213d5', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-30', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-04-30 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '865978e3-c0cd-59ad-be2e-8503f1b6bdcc', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-05-01', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-01 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3bbc8979-e563-5c2e-9a66-68ba30f482db', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-05-02', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-02 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '2435c80d-908b-5d01-b267-d9897879e17f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-05-04', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '31a6c07c-bc68-56e0-8bc5-d35defba73e9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-05-05', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-05 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '4bc5e56c-72e6-57d0-b541-dac71e406589', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-05-06', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '4ae022a6-554e-5466-b1d1-a74bb49bdc80', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-05-07', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '9ffc8192-981f-5fb1-98e8-87916fcdc072', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-05-08', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '4390aa17-5f05-50a6-95a0-044a44e15949', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-05-09', true,
  'tracker=PKG-92236 | import_id=PKG-92236-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-09 09:00:00+00'
);

-- PKG-92236-03 Rumi (21/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'be807960-f92d-45ea-aa79-7ade29f78c3b', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'daycare_half_day', 21, 21, '2026-10-09',
  'package_purchase', 'fd6269f0-b500-40cf-a198-101d79e778b2', '039c0387-d1d1-4e53-aa29-9b269dc78530', false, 'depleted', '2026-04-09 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a2d997e5-35cb-5f81-8225-9384bb230f1e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-08', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '68d72178-6c98-5c4d-8994-4757121c2ae4', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-09', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'eaaf832f-69b8-53e6-93b2-1a80c1915855', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-10', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f3a5fb8d-d34b-59e5-980e-10267de9528a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-11', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '7f805eec-7a57-5c6a-b783-2cad574bba7f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-14', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '864d97b3-f5b4-538f-99ad-055c5a4e63b4', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-16', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '26105fe8-b93c-57f9-b207-c250c6573c60', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-17', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-17 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd5828d26-657e-5306-bd74-74cbeb0f71ec', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-20', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'cb542a13-cb48-5325-8548-0bc3353a0d37', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-21', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3b2ef4a0-1161-5c71-9aea-dfd32e24e6d9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-23', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-23 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'bdcddf2b-423f-5186-8657-f667e0198ece', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-25', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-25 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6905a931-071f-551e-829b-9795b239ee17', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-27', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-27 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b964e435-7a3a-52ff-a66f-2dba8099f6b1', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-30', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-04-30 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd7c3f25d-abce-5c02-bd85-c875fe45b551', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-05-01', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-01 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a95c4c99-f9df-5737-810b-e5c6848b04e0', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-05-02', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-02 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '90ea6773-71f2-5819-ade5-8a4a7892ac6b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-05-04', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '888c0484-9103-51ac-a3a1-a4781ab29880', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-05-05', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-05 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'c08cca63-5126-5056-b74a-14b83836d139', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-05-06', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6774aa50-d9d7-549e-a900-ce89d9ded727', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-05-07', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'efa5d86a-50bb-536e-ad3d-4dc61d12d884', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-05-08', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'ac9f1622-d610-5506-9ba8-6467052da594', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-05-09', true,
  'tracker=PKG-92236 | import_id=PKG-92236-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-09 09:00:00+00'
);

-- PKG-93168 invoice 93168
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '2026-05-13', 'paid',
  2551.5, 2551.5, 2551.5, 2551.5, 121.5,
  'bank_transfer', 'package',
  'Legacy daycare package purchase | tracker=PKG-93168 | raw_type=A/F/R 6 Half Day Package | import_id=PKG-93168-* | per_pet_from_usage_view | authority:tania_farha_usage_view_v1',
  '2026-05-13 12:00:00+00', 2551.5
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('dec0b04e-26ea-43a2-b16a-64d7092e5701', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', '68b46040-3916-483f-bda1-63befb1ce1c6', 3, 0);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'A/F/R 6 Half Day Package — Alfie / Finley / Rumi (PKG-93168)', 1, 2551.5, 2551.5, 2551.5, 'package');

-- PKG-93168-01 Alfie (9/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '3e193691-9055-49fb-98f8-0dfdd875b478', 'daycare_half_day', 21, 9, '2026-11-13',
  'package_purchase', 'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'dec0b04e-26ea-43a2-b16a-64d7092e5701', false, 'active', '2026-05-13 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '4718c30d-22c7-55f4-97ac-1340b1f2a8fc', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-13', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-13 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '1be721a4-cfd1-5301-af60-4c81705b2246', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-15', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '51b6e1ff-a8c4-501f-9d98-81486d4ee980', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-16', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b3e77aa2-3177-53c5-a261-6cdf46498f43', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-18', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-18 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'edea0e79-88f4-5aba-ae2c-decfd6c01175', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-19', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-19 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '248edfdf-f3fe-5bea-a6f8-96564c1ce742', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-20', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '5fa7e9db-d389-5d19-8634-6e4cc7c5c0e1', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-21', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '99eee1ca-0f61-5c59-ba2b-e30f66f6cc28', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-22', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-22 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '59f24263-16b9-5c37-bb86-2a76abca9354', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-23', true,
  'tracker=PKG-93168 | import_id=PKG-93168-01 | pet=Alfie | authority:tania_farha_usage_view_v1', '2026-05-23 09:00:00+00'
);

-- PKG-93168-02 Finley (11/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '11059926-7a1b-403e-b058-38c3e133d37d', 'daycare_half_day', 21, 11, '2026-11-13',
  'package_purchase', 'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'dec0b04e-26ea-43a2-b16a-64d7092e5701', false, 'active', '2026-05-13 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '7f512fe7-0e15-524a-9682-ee5ebedd4cae', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-11', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'cda08b73-c718-5c73-be38-3934cb451457', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-12', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-12 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e7d54a4d-0481-50b9-b0af-a047b242290c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-13', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-13 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '431437db-98f3-5f83-af08-3cda0811b351', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-15', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'ed1d79f8-748a-50d4-a533-6aecaad175f1', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-16', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0d54d264-0e77-5b75-83ca-657fc75c6068', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-18', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-18 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '87ea9188-2f12-59f5-8f94-06520674f868', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-19', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-19 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3dc2dc92-2699-5945-80e1-75ce55a2905a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-20', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '71af562b-8195-52f0-9aec-2062c89e9717', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-21', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a91f94d6-31fc-56e1-a09f-67c3136e9e6d', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-22', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-22 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'bc9cf470-68c0-5f08-bf5b-1fe3fe8d8635', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-23', true,
  'tracker=PKG-93168 | import_id=PKG-93168-02 | pet=Finley | authority:tania_farha_usage_view_v1', '2026-05-23 09:00:00+00'
);

-- PKG-93168-03 Rumi (11/21)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'daycare_half_day', 21, 11, '2026-11-13',
  'package_purchase', 'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'dec0b04e-26ea-43a2-b16a-64d7092e5701', false, 'active', '2026-05-13 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '7a6cd11c-0205-5e9f-abbd-3a4991f6eb6f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-11', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'ae1f290f-fe90-5e13-b229-3f33a0d6da7f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-12', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-12 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'cf1474fe-308b-55a4-b80b-c8149e12476e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-13', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-13 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b0572268-e08b-5535-b7b4-f4725e9c28fc', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-15', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f7a81b2d-f516-579b-9281-1b184863174f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-16', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f31083a4-7306-50c2-ab76-3eba27b08a2e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-18', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-18 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd4cd3d4a-f18c-5aac-afaf-b33a6c1802fa', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-19', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-19 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f31a2113-b95a-5ffc-b9f3-cbeb1a6779d6', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-20', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-20 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '6ab70e25-2df6-511f-9ede-61fdbdbbc87c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-21', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-21 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a21d2941-684a-575a-94a6-b5905bc9091a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-22', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-22 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0feb3620-5865-5d2c-8feb-b3c719e5c0a7', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-23', true,
  'tracker=PKG-93168 | import_id=PKG-93168-03 | pet=Rumi | authority:tania_farha_usage_view_v1', '2026-05-23 09:00:00+00'
);

COMMIT;

-- Verification
SELECT (regexp_match(i.notes, 'tracker=([^ |]+)'))[1] AS tracker_id,
  p.name AS pet, sc.units_total, sc.units_consumed,
  sc.units_total - sc.units_consumed AS remaining, sc.status,
  i.total_aed, i.amount_paid, i.vat_aed,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS sessions,
  i.notes LIKE '%authority:tania_farha_usage_view_v1%' AS guard_applied
FROM service_credits sc
JOIN pets p ON p.id = sc.pet_id
JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
JOIN invoices i ON i.id = pg.invoice_id
WHERE p.owner_id = 'f48c6022-008e-49a3-b6e0-4789b891f6fb'::uuid
  AND i.notes ~ 'tracker=PKG'
ORDER BY tracker_id, p.name;