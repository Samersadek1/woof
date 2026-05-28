-- Buddy & Sable Nelson (Robbie/Gillian) — May 2026 daycare package cleanup
--
-- Problem: Invoice 93219/93263 was migrated as THREE duplicate trackers, each with
-- full session history for both pets (tripled balances). PKG-93219 also picked up a
-- bogus usage row from spreadsheet text "Free SSPL used free wash on May 14".
--
-- Fix:
--   1. Remove duplicate packages PKG-93219 and PKG-93263 (keep PKG-93219-93263).
--   2. Set canonical credits to 8 days used each (authority usage dates).
--   3. Set canonical invoice issue_date to 2026-05-14.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Remove duplicate tracker packages (May 14 / May 16 split invoices)
-- ---------------------------------------------------------------------------
DELETE FROM daycare_sessions
WHERE package_id IN (
  '6bca4d7a-00c1-49ac-8572-3140bfbd19b0'::uuid,
  '3ee530f6-915f-4429-8a99-2b3bfba2b6ea'::uuid,
  '7609f2fa-19f3-4c9f-a8db-ab6c1867f8ff'::uuid,
  'c97004b6-8661-4fdc-b788-fd4f90e5d9c8'::uuid
);

DELETE FROM service_credits
WHERE id IN (
  '6bca4d7a-00c1-49ac-8572-3140bfbd19b0'::uuid,
  '3ee530f6-915f-4429-8a99-2b3bfba2b6ea'::uuid,
  '7609f2fa-19f3-4c9f-a8db-ab6c1867f8ff'::uuid,
  'c97004b6-8661-4fdc-b788-fd4f90e5d9c8'::uuid
);

DELETE FROM invoices
WHERE id IN (
  'fb29a2da-f816-43d2-9665-4c2b54a1b151'::uuid, -- PKG-93219 (issue 2026-05-14)
  'bd48360e-990d-4974-89df-39de45ff81cd'::uuid  -- PKG-93263 (issue 2026-05-16)
);

-- ---------------------------------------------------------------------------
-- 2. Canonical package PKG-93219-93263 — both pets, 8 usage days
-- ---------------------------------------------------------------------------
UPDATE invoices
SET issue_date = '2026-05-14'
WHERE id = 'bbb97321-d162-45bc-b165-295e7e6d9a35'::uuid;

UPDATE service_credits
SET units_consumed = 8
WHERE id IN (
  '31922623-bbf3-47b6-ad2c-3cf93622d4f7'::uuid, -- Buddy
  '06d4a115-c5c9-4ccb-a9c0-43548c703bf1'::uuid  -- Sable
);

COMMIT;

-- Verification (expect: 2 credits, 8 sessions each, no PKG-93219/93263 invoices)
SELECT i.notes, i.issue_date::text,
  p.name AS pet,
  sc.units_total,
  sc.units_consumed,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS sessions
FROM invoices i
JOIN purchase_groups pg ON pg.invoice_id = i.id
JOIN service_credits sc ON sc.purchase_group_id = pg.id
JOIN pets p ON p.id = sc.pet_id
WHERE i.notes LIKE '%tracker=PKG-93219%'
   OR i.notes LIKE '%tracker=PKG-93263%'
ORDER BY i.notes, p.name;

SELECT COUNT(*) AS bogus_sspl_sessions
FROM daycare_sessions ds
WHERE ds.notes ILIKE '%Free SSPL%'
  AND ds.pet_id IN (
    'cd555796-250b-4dc0-b080-2d7f8ee76747'::uuid,
    '3234a975-2082-435f-bd14-0745528502e9'::uuid
  );
