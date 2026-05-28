-- Tamima Kronfol: reset PKG daycare data; rebuild from tax invoices 92359 + 93504 only.
-- Model: ONE shared 30-day pool per invoice; EACH pet visit = 1 day (3 pets same day = 3 days).
-- One service_credit per invoice (units_total=30); sessions record each pet attendance.
-- Parser supports "11 April Lotus" and "May 16 Lotus" date formats.
-- Guard: authority:tamima_kronfol_shared_pool_v1

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE owner_id = '9d625d7c-d7f2-42f7-8198-03fa42b381ae'::uuid
      AND notes LIKE '%authority:tamima_kronfol_shared_pool_v1%'
  ) THEN
    RAISE EXCEPTION 'Already applied (authority:tamima_kronfol_shared_pool_v1).';
  END IF;
END $$;

DELETE FROM daycare_sessions ds
WHERE ds.package_id IN (
  SELECT sc.id FROM service_credits sc
  JOIN pets p ON p.id = sc.pet_id
  WHERE p.owner_id = '9d625d7c-d7f2-42f7-8198-03fa42b381ae'::uuid
    AND sc.service_code IN ('daycare_full_day', 'daycare_half_day', 'daycare_hourly')
);

DELETE FROM service_credits sc
USING pets p
WHERE sc.pet_id = p.id
  AND p.owner_id = '9d625d7c-d7f2-42f7-8198-03fa42b381ae'::uuid
  AND sc.service_code IN ('daycare_full_day', 'daycare_half_day', 'daycare_hourly')
  AND sc.source_type = 'package_purchase';

DELETE FROM invoice_line_items ili
USING invoices i
WHERE ili.invoice_id = i.id
  AND i.owner_id = '9d625d7c-d7f2-42f7-8198-03fa42b381ae'::uuid
  AND i.notes LIKE '%tracker=PKG%';

DELETE FROM purchase_groups pg
USING invoices i
WHERE pg.invoice_id = i.id
  AND i.owner_id = '9d625d7c-d7f2-42f7-8198-03fa42b381ae'::uuid
  AND i.notes LIKE '%tracker=PKG%';

DELETE FROM invoices i
WHERE i.owner_id = '9d625d7c-d7f2-42f7-8198-03fa42b381ae'::uuid
  AND i.notes LIKE '%tracker=PKG%';


-- PKG-92359: 30/30 combined (each row = 1 day)
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  '50fbbea0-3fd3-4638-944e-2634f8b9d275', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '2026-04-14', 'paid', 2441.5, 2441.5, 2441.5, 2441.5, 116.26,
  'card', 'package',
  'Legacy daycare package purchase | tracker=PKG-92359 | raw_type=30 Day Ticket(30 Full Dcare Days) | shared_pool_30_combined | pets=Lotus,Mei Mei,Rocky | authority:tamima_kronfol_shared_pool_v1',
  '2026-04-14 12:00:00+00', 2441.5
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('a30c1795-791c-430c-821c-1cf1dafdb31b', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '50fbbea0-3fd3-4638-944e-2634f8b9d275', '26f00052-5726-4f53-b71b-d9ecdad0e604', 3, 10);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('50fbbea0-3fd3-4638-944e-2634f8b9d275', '30 Day Ticket — Lotus / Mei Mei / Rocky shared pool (PKG-92359)', 1, 2441.5, 2441.5, 2441.5, 'package');

INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '31d18899-4867-4524-bfdc-35069e33436e', 'daycare_full_day', 30, 30, '2026-10-14',
  'package_purchase', '50fbbea0-3fd3-4638-944e-2634f8b9d275', 'a30c1795-791c-430c-821c-1cf1dafdb31b', false, 'depleted', '2026-04-14 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('9f79eb74-2385-4376-ab75-c56ad10e3424', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-11', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-04-11 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('4c579265-420c-4da7-bca8-ea35bba440e1', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-14', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-04-14 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('bfc62a1a-cda7-43b9-8d35-3da9932ad895', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-18', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-04-18 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('82d67914-691f-4d82-bdb1-fb632c3c511c', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-18', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-04-18 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('caae5209-5224-40ea-9fd6-cb70adb7614f', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-21', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-04-21 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('85a79067-1779-47d6-9ac4-2f5bd2286ff5', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-25', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-04-25 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('160a3ec1-b5c7-4492-8d97-e25d9bc3c9ac', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-25', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-04-25 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('bb7ed8f8-ee2d-436e-9b74-2d2fa11378e2', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-28', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-04-28 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('a404ca09-2316-4466-8d43-18a56100d40d', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-28', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-04-28 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('a502ffe9-091f-42ae-bf61-1afea3881539', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-04-28', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-04-28 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('0cd9ad1a-09d4-46b8-af13-662a8b3eb39b', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-02', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-05-02 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('186c7863-3c86-481e-ba20-fd93458c86ee', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-02', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-05-02 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('17500361-b776-43a7-a8e9-41ec59fade95', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-02', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-05-02 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('4774c006-78c8-4f56-9e2b-8f9a8bf363a3', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-05', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-05-05 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('4c91f0ab-f91d-4a2a-8489-440599606d9a', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-05', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-05-05 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('6678b441-36c7-4f3b-9cb4-e362fff898d1', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-05', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-05-05 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('1576afd4-883e-4b65-b606-5cc7f846c687', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-09', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-05-09 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('131a4cae-46c0-4fea-8773-0fea3cfa2721', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-09', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-05-09 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('1298c66e-a1cd-4bee-98ce-3592e213d39a', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-09', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-05-09 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('74b46d34-d281-4003-9344-c768cae695d5', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-12', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-05-12 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('53df272f-0f12-488e-9abe-14b6bffc37a5', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-12', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-05-12 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('5c94856b-639f-47b1-86e8-fba5b1981970', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-12', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-05-12 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('cab81128-0b7c-41ed-8a1b-6347daac9ed0', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-16', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-05-16 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('c2148c7e-86d8-4437-97e2-71737605447b', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-16', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-05-16 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('0b164285-4831-4c87-a905-8b2e7fc82d5f', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-16', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-05-16 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('e49d1014-0a30-4605-aa82-d7d9057d0ba6', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-19', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-05-19 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('11c12df9-31e3-4f8b-8f05-7fb99adac3cf', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-19', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-05-19 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('79d3f3cb-ab04-4b2c-82bc-3decedb5406d', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-19', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-05-19 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('18f9c969-55e4-41c2-b2c2-5d5ef9006371', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-23', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-05-23 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('f079bb63-59bd-45b9-b455-4dc6cad1e49a', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', 'e53beba5-de6e-4a9d-a85c-96a04bbf330a', '2026-05-23', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-05-23 09:00:00+00');

-- PKG-93504: 4/30 combined (each row = 1 day)
INSERT INTO invoices (
  id, owner_id, issue_date, status, subtotal, subtotal_aed, total, total_aed, vat_aed,
  payment_method, service_type, notes, paid_at, amount_paid
) VALUES (
  'c7e34d74-4c60-4393-a758-95be53cd454b', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '2026-05-25', 'paid', 2441.5, 2441.5, 2441.5, 2441.5, 116.26,
  'card', 'package',
  'Legacy daycare package purchase | tracker=PKG-93504 | raw_type=30 Day Ticket(30 Full Dcare Days) | shared_pool_30_combined | pets=Lotus,Mei Mei,Rocky | authority:tamima_kronfol_shared_pool_v1',
  '2026-05-25 12:00:00+00', 2441.5
);

INSERT INTO purchase_groups (id, owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
VALUES ('b32f977e-448e-4d62-a928-4c70cae5375d', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'c7e34d74-4c60-4393-a758-95be53cd454b', '26f00052-5726-4f53-b71b-d9ecdad0e604', 3, 10);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, total_price, line_total, service_type)
VALUES ('c7e34d74-4c60-4393-a758-95be53cd454b', '30 Day Ticket — Lotus / Mei Mei / Rocky shared pool (PKG-93504)', 1, 2441.5, 2441.5, 2441.5, 'package');

INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '3d10aa80-ba1b-407b-a697-155f73bccadd', '31d18899-4867-4524-bfdc-35069e33436e', 'daycare_full_day', 30, 4, '2026-11-25',
  'package_purchase', 'c7e34d74-4c60-4393-a758-95be53cd454b', 'b32f977e-448e-4d62-a928-4c70cae5375d', false, 'active', '2026-05-25 00:00:00+00'
);
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('d84fb777-91c5-4864-9d80-4eb707f4c2e9', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', '3d10aa80-ba1b-407b-a697-155f73bccadd', '2026-05-23', true, 'tracker=PKG-93504 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-05-23 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('9723b3f6-3ba9-405f-822f-b2808e24e282', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', '3d10aa80-ba1b-407b-a697-155f73bccadd', '2026-05-26', true, 'tracker=PKG-93504 | shared_pool | pet=Lotus | authority:tamima_kronfol_shared_pool_v1', '2026-05-26 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('707ead8d-ff75-48d1-a442-d2b2fafe56c4', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', '3d10aa80-ba1b-407b-a697-155f73bccadd', '2026-05-26', true, 'tracker=PKG-93504 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_shared_pool_v1', '2026-05-26 09:00:00+00');
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES ('c718df94-56d9-4a15-bc13-a405042ccca5', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', '3d10aa80-ba1b-407b-a697-155f73bccadd', '2026-05-26', true, 'tracker=PKG-93504 | shared_pool | pet=Rocky | authority:tamima_kronfol_shared_pool_v1', '2026-05-26 09:00:00+00');

COMMIT;

-- Verification
SELECT (regexp_match(i.notes, 'tracker=([^ |]+)'))[1] AS tracker,
  sc.units_total, sc.units_consumed, sc.units_total - sc.units_consumed AS remaining, sc.status,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS sessions
FROM service_credits sc
JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
JOIN invoices i ON i.id = pg.invoice_id
WHERE i.notes LIKE '%authority:tamima_kronfol_shared_pool_v1%'
ORDER BY tracker;
