-- DEPRECATED: wrong authority source. Use fix-tania-farha-daycare-packages-from-usage-view.sql
-- (~/Downloads/Tania_Farha_Usage_View_1.xlsx) instead.
--
-- Tania Farha (f48c6022-008e-49a3-b6e0-4789b891f6fb): delete + rebuild daycare packages
-- Authority: ~/Downloads/WOOF_Daycare_Package_Tracker_Simple.xlsx (Package Tracker + Usage Dates)
-- Model: one service_credit per pet (6 half-days each); invoice total is post-tax AED
-- Guard: authority:tania_farha_tracker_v1

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE owner_id = 'f48c6022-008e-49a3-b6e0-4789b891f6fb'::uuid
      AND notes LIKE '%authority:tania_farha_tracker_v1%'
  ) THEN
    RAISE EXCEPTION 'Already applied (authority:tania_farha_tracker_v1).';
  END IF;
END $$;

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
  'Legacy daycare package purchase | tracker=PKG-85435 | raw_type=6 Half Daycare Day | per_pet_6_half_days | authority:tania_farha_tracker_v1',
  '2025-07-22 12:00:00+00', 567.0
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('186ec8f8-6138-4abc-ab89-c9e7d0cdcef9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'f69f342e-b365-44d0-bb6c-06dd6495dab4', '68b46040-3916-483f-bda1-63befb1ce1c6', 1, 0);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('f69f342e-b365-44d0-bb6c-06dd6495dab4', '6 Half Daycare Day — Lilly (PKG-85435)', 1, 567.0, 567.0, 567.0, 'package');

-- Lilly credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '76f7edcc-d809-4da1-8ead-76fcab9d762e', 'bf0c8ca1-aff0-4389-953e-a325306049db', 'daycare_half_day', 6, 6, '2026-01-22',
  'package_purchase', 'f69f342e-b365-44d0-bb6c-06dd6495dab4', '186ec8f8-6138-4abc-ab89-c9e7d0cdcef9', false, 'depleted', '2025-07-22 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a9f5c7e1-7d68-4b7c-b81e-5c8e07a1b295', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-07-29', true,
  'tracker=PKG-85435 | pet=Lilly | authority:tania_farha_tracker_v1', '2025-07-29 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '624db1ef-3714-44f6-88a4-df31b5484cc5', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-02', true,
  'tracker=PKG-85435 | pet=Lilly | authority:tania_farha_tracker_v1', '2025-08-02 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '60930799-7dc8-44b0-ba34-779b3f3a1e78', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-05', true,
  'tracker=PKG-85435 | pet=Lilly | authority:tania_farha_tracker_v1', '2025-08-05 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '17fc80f9-8815-4de8-ba71-254315ba127e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-09', true,
  'tracker=PKG-85435 | pet=Lilly | authority:tania_farha_tracker_v1', '2025-08-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '2992b541-dc19-430d-a640-8718047b31cd', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-12', true,
  'tracker=PKG-85435 | pet=Lilly | authority:tania_farha_tracker_v1', '2025-08-12 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '0ebfe660-9bbc-4480-97aa-7789ce29a698', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'bf0c8ca1-aff0-4389-953e-a325306049db', '76f7edcc-d809-4da1-8ead-76fcab9d762e', '2025-08-14', true,
  'tracker=PKG-85435 | pet=Lilly | authority:tania_farha_tracker_v1', '2025-08-14 09:00:00+00'
);

-- PKG-87380 invoice 87380
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  '7282ecd5-6341-4022-bfea-9b9eb3b654b9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '2025-10-02', 'paid',
  2551.5, 2551.5, 2551.5, 2551.5, 121.5,
  'bank_transfer', 'package',
  'Legacy daycare package purchase | tracker=PKG-87380 | raw_type=R/A/F 6 half daycare day | per_pet_6_half_days | authority:tania_farha_tracker_v1',
  '2025-10-02 12:00:00+00', 2551.5
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('72047016-eb4e-40fc-8238-b3480d62e2f2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '7282ecd5-6341-4022-bfea-9b9eb3b654b9', '68b46040-3916-483f-bda1-63befb1ce1c6', 3, 0);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('7282ecd5-6341-4022-bfea-9b9eb3b654b9', 'R/A/F 6 half daycare day — Alfie / Finley / Rumi (PKG-87380)', 1, 2551.5, 2551.5, 2551.5, 'package');

-- Alfie credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '3e193691-9055-49fb-98f8-0dfdd875b478', 'daycare_half_day', 6, 6, '2026-04-02',
  'package_purchase', '7282ecd5-6341-4022-bfea-9b9eb3b654b9', '72047016-eb4e-40fc-8238-b3480d62e2f2', false, 'depleted', '2025-10-02 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'ee3186d5-08de-4e02-b05d-a884a9a68cf0', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-03', true,
  'tracker=PKG-87380 | pet=Alfie | authority:tania_farha_tracker_v1', '2025-10-03 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '9c4c2535-c818-4837-ae10-8e2abd330d24', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-04', true,
  'tracker=PKG-87380 | pet=Alfie | authority:tania_farha_tracker_v1', '2025-10-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'eb7cb1f3-6cff-41e8-aabf-0ded8420d4aa', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-06', true,
  'tracker=PKG-87380 | pet=Alfie | authority:tania_farha_tracker_v1', '2025-10-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'df7cf998-094b-4d4f-9f03-5055c4a7ca44', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-07', true,
  'tracker=PKG-87380 | pet=Alfie | authority:tania_farha_tracker_v1', '2025-10-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3723ca54-9605-4366-9bca-f5d7ea6c5423', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-09', true,
  'tracker=PKG-87380 | pet=Alfie | authority:tania_farha_tracker_v1', '2025-10-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '275b10cf-749b-464e-957a-ba397ea053cb', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'f76f678b-eabd-4512-84d4-7d8775c1dfd3', '2025-10-10', true,
  'tracker=PKG-87380 | pet=Alfie | authority:tania_farha_tracker_v1', '2025-10-10 09:00:00+00'
);

-- Finley credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '44f2855d-4b30-4474-96f4-7455400099a8', '11059926-7a1b-403e-b058-38c3e133d37d', 'daycare_half_day', 6, 6, '2026-04-02',
  'package_purchase', '7282ecd5-6341-4022-bfea-9b9eb3b654b9', '72047016-eb4e-40fc-8238-b3480d62e2f2', false, 'depleted', '2025-10-02 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f6c1a7fb-db01-4945-88e2-c70ef482d3ed', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-03', true,
  'tracker=PKG-87380 | pet=Finley | authority:tania_farha_tracker_v1', '2025-10-03 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '7cb48f18-e3a5-4038-b132-748693de5d7c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-04', true,
  'tracker=PKG-87380 | pet=Finley | authority:tania_farha_tracker_v1', '2025-10-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'ff5ad93c-0db7-4696-a86f-461c8328c584', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-06', true,
  'tracker=PKG-87380 | pet=Finley | authority:tania_farha_tracker_v1', '2025-10-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd0711137-2ace-4104-b5e6-4e77e3f0231b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-07', true,
  'tracker=PKG-87380 | pet=Finley | authority:tania_farha_tracker_v1', '2025-10-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '52d7ff51-fdc0-4e81-be20-4a22a13b72ea', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-09', true,
  'tracker=PKG-87380 | pet=Finley | authority:tania_farha_tracker_v1', '2025-10-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '46db2491-48e9-43bc-b960-1fca7eca38f1', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', '44f2855d-4b30-4474-96f4-7455400099a8', '2025-10-10', true,
  'tracker=PKG-87380 | pet=Finley | authority:tania_farha_tracker_v1', '2025-10-10 09:00:00+00'
);

-- Rumi credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'daycare_half_day', 6, 6, '2026-04-02',
  'package_purchase', '7282ecd5-6341-4022-bfea-9b9eb3b654b9', '72047016-eb4e-40fc-8238-b3480d62e2f2', false, 'depleted', '2025-10-02 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd5d15e5b-998a-47e4-a6f5-56e8f2a2e52c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-03', true,
  'tracker=PKG-87380 | pet=Rumi | authority:tania_farha_tracker_v1', '2025-10-03 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'db94defc-db1a-4f83-bdc0-09ed7177ef22', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-04', true,
  'tracker=PKG-87380 | pet=Rumi | authority:tania_farha_tracker_v1', '2025-10-04 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'dd3e64fb-8a48-401a-bba2-b46acc8b3e28', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-06', true,
  'tracker=PKG-87380 | pet=Rumi | authority:tania_farha_tracker_v1', '2025-10-06 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e4e98b0c-fd9c-4bc6-bbd4-aa8b9873ad9a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-07', true,
  'tracker=PKG-87380 | pet=Rumi | authority:tania_farha_tracker_v1', '2025-10-07 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '19bf8045-9c9b-4045-90e5-7c49e9127d87', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-09', true,
  'tracker=PKG-87380 | pet=Rumi | authority:tania_farha_tracker_v1', '2025-10-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '78ac746c-ecac-4a38-8c94-8eba581140c4', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'd5c1bc43-8633-45a7-a2ca-cd7b755c7f22', '2025-10-10', true,
  'tracker=PKG-87380 | pet=Rumi | authority:tania_farha_tracker_v1', '2025-10-10 09:00:00+00'
);

-- PKG-92236 invoice 92236
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  'fd6269f0-b500-40cf-a198-101d79e778b2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '2026-04-09', 'paid',
  2551.5, 2551.5, 2551.5, 2551.5, 121.5,
  'bank_transfer', 'package',
  'Legacy daycare package purchase | tracker=PKG-92236 | raw_type=A/F/R 6 Half Day Package | per_pet_6_half_days | authority:tania_farha_tracker_v1',
  '2026-04-09 12:00:00+00', 2551.5
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('039c0387-d1d1-4e53-aa29-9b269dc78530', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'fd6269f0-b500-40cf-a198-101d79e778b2', '68b46040-3916-483f-bda1-63befb1ce1c6', 3, 0);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('fd6269f0-b500-40cf-a198-101d79e778b2', 'A/F/R 6 Half Day Package — Alfie / Finley / Rumi (PKG-92236)', 1, 2551.5, 2551.5, 2551.5, 'package');

-- Alfie credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '3e193691-9055-49fb-98f8-0dfdd875b478', 'daycare_half_day', 6, 6, '2026-10-09',
  'package_purchase', 'fd6269f0-b500-40cf-a198-101d79e778b2', '039c0387-d1d1-4e53-aa29-9b269dc78530', false, 'depleted', '2026-04-09 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a54e4a92-092e-45f2-9a58-620a8fe502eb', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-09', true,
  'tracker=PKG-92236 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-04-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd67d9091-68c3-4f37-93a8-4d921935a20e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-10', true,
  'tracker=PKG-92236 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-04-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e9915cfd-9d5e-49a9-8f9d-c4e9036c668f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-11', true,
  'tracker=PKG-92236 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-04-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'bc7b1631-381b-4ca4-9052-48a282b6817c', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-14', true,
  'tracker=PKG-92236 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-04-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '2d63f527-40a3-439f-8cf6-d6e17021c17a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-16', true,
  'tracker=PKG-92236 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-04-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b5b8075b-4aa5-4fb2-8d0e-e3c8d56cdb02', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', '3bfe7e53-bdd3-466f-be9c-16e8d08a8992', '2026-04-20', true,
  'tracker=PKG-92236 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-04-20 09:00:00+00'
);

-- Finley credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '11059926-7a1b-403e-b058-38c3e133d37d', 'daycare_half_day', 6, 6, '2026-10-09',
  'package_purchase', 'fd6269f0-b500-40cf-a198-101d79e778b2', '039c0387-d1d1-4e53-aa29-9b269dc78530', false, 'depleted', '2026-04-09 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '543451c3-094f-42cf-bcb2-7a32eddfc33a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-08', true,
  'tracker=PKG-92236 | pet=Finley | authority:tania_farha_tracker_v1', '2026-04-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'b671a65b-cc06-4411-b89a-1f5d48148eee', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-09', true,
  'tracker=PKG-92236 | pet=Finley | authority:tania_farha_tracker_v1', '2026-04-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'a9c3df62-2ff9-4d43-ba6c-ee6298a7b96f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-10', true,
  'tracker=PKG-92236 | pet=Finley | authority:tania_farha_tracker_v1', '2026-04-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e41e2891-3d5b-4739-8c41-02aa4ab6266d', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-11', true,
  'tracker=PKG-92236 | pet=Finley | authority:tania_farha_tracker_v1', '2026-04-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '23768c1b-7d2d-43ae-bdbc-726f336c876d', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-14', true,
  'tracker=PKG-92236 | pet=Finley | authority:tania_farha_tracker_v1', '2026-04-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'e2b93a70-5785-43e5-a7f8-022f077511e0', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'bcc12447-c031-49b0-ab4d-bfeda40e8dc6', '2026-04-16', true,
  'tracker=PKG-92236 | pet=Finley | authority:tania_farha_tracker_v1', '2026-04-16 09:00:00+00'
);

-- Rumi credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'be807960-f92d-45ea-aa79-7ade29f78c3b', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'daycare_half_day', 6, 6, '2026-10-09',
  'package_purchase', 'fd6269f0-b500-40cf-a198-101d79e778b2', '039c0387-d1d1-4e53-aa29-9b269dc78530', false, 'depleted', '2026-04-09 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '86696911-8ce5-484d-8666-e0a85a6fbeb2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-08', true,
  'tracker=PKG-92236 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-04-08 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '7f87b27e-73e5-4acb-86e0-680a1d669022', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-09', true,
  'tracker=PKG-92236 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-04-09 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '9d9ff22c-c136-4750-b91b-3d54d70989ac', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-10', true,
  'tracker=PKG-92236 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-04-10 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '37332815-fafe-4d3d-9744-868825251619', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-11', true,
  'tracker=PKG-92236 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-04-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '2d4cb396-a9f2-47bc-9b04-c9bff8f99b80', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-14', true,
  'tracker=PKG-92236 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-04-14 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '66bffb2f-577b-475a-bf07-36d65ab5f4ac', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'be807960-f92d-45ea-aa79-7ade29f78c3b', '2026-04-16', true,
  'tracker=PKG-92236 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-04-16 09:00:00+00'
);

-- PKG-93168 invoice 93168
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '2026-05-13', 'paid',
  2551.5, 2551.5, 2551.5, 2551.5, 121.5,
  'bank_transfer', 'package',
  'Legacy daycare package purchase | tracker=PKG-93168 | raw_type=A/F/R 6 Half Day Package | per_pet_6_half_days | authority:tania_farha_tracker_v1',
  '2026-05-13 12:00:00+00', 2551.5
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('dec0b04e-26ea-43a2-b16a-64d7092e5701', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', '68b46040-3916-483f-bda1-63befb1ce1c6', 3, 0);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'A/F/R 6 Half Day Package — Alfie / Finley / Rumi (PKG-93168)', 1, 2551.5, 2551.5, 2551.5, 'package');

-- Alfie credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '3e193691-9055-49fb-98f8-0dfdd875b478', 'daycare_half_day', 6, 6, '2026-11-13',
  'package_purchase', 'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'dec0b04e-26ea-43a2-b16a-64d7092e5701', false, 'depleted', '2026-05-13 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3bb4f7f9-87ca-4f47-a7be-6c10deb42b1d', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-13', true,
  'tracker=PKG-93168 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-05-13 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'efd69657-0c1b-45f0-874c-de31b014f0ad', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-15', true,
  'tracker=PKG-93168 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-05-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '158343cb-46d5-4829-a8ec-95aaaae09c80', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-16', true,
  'tracker=PKG-93168 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-05-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'd81ff59a-7055-41c3-8817-c65f345bb029', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-18', true,
  'tracker=PKG-93168 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-05-18 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'ec58fb77-1932-4003-b029-bc1937fd6dfd', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-19', true,
  'tracker=PKG-93168 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-05-19 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '5522d486-ab4e-4571-b7d2-84ec41ca099a', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '3e193691-9055-49fb-98f8-0dfdd875b478', 'ee5551e9-95ae-4bc4-bc22-8f9cb2a6ba5a', '2026-05-20', true,
  'tracker=PKG-93168 | pet=Alfie | authority:tania_farha_tracker_v1', '2026-05-20 09:00:00+00'
);

-- Finley credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '11059926-7a1b-403e-b058-38c3e133d37d', 'daycare_half_day', 6, 6, '2026-11-13',
  'package_purchase', 'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'dec0b04e-26ea-43a2-b16a-64d7092e5701', false, 'depleted', '2026-05-13 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '3a615b66-b78c-47e4-be33-9791e6096784', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-11', true,
  'tracker=PKG-93168 | pet=Finley | authority:tania_farha_tracker_v1', '2026-05-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '713bd663-fa70-4277-bb17-07fd96ffc657', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-12', true,
  'tracker=PKG-93168 | pet=Finley | authority:tania_farha_tracker_v1', '2026-05-12 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '8365ebe3-4937-4428-a263-bbeefef0ae0f', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-13', true,
  'tracker=PKG-93168 | pet=Finley | authority:tania_farha_tracker_v1', '2026-05-13 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'dfa869fb-9250-41f1-b82e-333af882f2d8', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-15', true,
  'tracker=PKG-93168 | pet=Finley | authority:tania_farha_tracker_v1', '2026-05-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '8d2ef4d3-d2a2-4870-b8ae-f54600eec3b0', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-16', true,
  'tracker=PKG-93168 | pet=Finley | authority:tania_farha_tracker_v1', '2026-05-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '89561eae-df4b-45e0-9cf4-388f9d9a421e', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', '11059926-7a1b-403e-b058-38c3e133d37d', 'fd6d2cf1-ce9f-4681-b93a-2b62a9f8d6cd', '2026-05-18', true,
  'tracker=PKG-93168 | pet=Finley | authority:tania_farha_tracker_v1', '2026-05-18 09:00:00+00'
);

-- Rumi credit (6/6)
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', 'daycare_half_day', 6, 6, '2026-11-13',
  'package_purchase', 'b8464de6-6e3a-4f64-8b4f-6e209ccf9ae9', 'dec0b04e-26ea-43a2-b16a-64d7092e5701', false, 'depleted', '2026-05-13 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'bd43753a-24a1-4afd-a03b-f4cb7b87a2a7', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-11', true,
  'tracker=PKG-93168 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-05-11 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '588e73d5-344d-4f5a-b8f7-aa37f40c9ea4', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-12', true,
  'tracker=PKG-93168 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-05-12 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'f85de60f-dd5b-4bf8-ad0f-2decb1413642', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-13', true,
  'tracker=PKG-93168 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-05-13 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'fd42d0da-7bdb-48c9-80ba-093bb6aed763', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-15', true,
  'tracker=PKG-93168 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-05-15 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  '09a5ab59-77ed-42dd-9be3-5d0aaf0bdba2', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-16', true,
  'tracker=PKG-93168 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-05-16 09:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES (
  'bee9fd5a-33eb-4deb-b126-8521ee5dc82b', 'f48c6022-008e-49a3-b6e0-4789b891f6fb', 'd698cbdb-7b45-416a-af3e-c4d7c4fb38d5', '1a8c1bea-9d9a-4c6d-b2d2-e1c6b9ea693c', '2026-05-18', true,
  'tracker=PKG-93168 | pet=Rumi | authority:tania_farha_tracker_v1', '2026-05-18 09:00:00+00'
);

COMMIT;

-- Verification
SELECT (regexp_match(i.notes, 'tracker=([^ |]+)'))[1] AS tracker_id,
  p.name AS pet, sc.units_total, sc.units_consumed,
  sc.units_total - sc.units_consumed AS remaining, sc.status,
  i.total_aed, i.amount_paid, i.vat_aed,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS sessions,
  i.notes LIKE '%authority:tania_farha_tracker_v1%' AS guard_applied
FROM service_credits sc
JOIN pets p ON p.id = sc.pet_id
JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
JOIN invoices i ON i.id = pg.invoice_id
WHERE p.owner_id = 'f48c6022-008e-49a3-b6e0-4789b891f6fb'::uuid
  AND i.notes ~ 'tracker=PKG'
ORDER BY tracker_id, p.name;