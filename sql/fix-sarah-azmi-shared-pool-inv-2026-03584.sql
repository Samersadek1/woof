-- Sarah Azmi: rebuild June 2026 package (INV-2026-03584) as shared Luna + Rocky pool.
-- Authority usage (5 days): Jun 11 Luna, Jun 17 Luna/Rocky, Jun 19 Luna/Rocky → 5/30 active.
-- Run AFTER fix-sarah-azmi-shared-pool-pkg-91073.sql (old pool fully depleted).
-- Guard: authority:sarah_azmi_shared_pool_june_v1

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE id = 'd96e0d95-a377-499e-958b-a14847acdc6f'::uuid
      AND notes LIKE '%authority:sarah_azmi_shared_pool_june_v1%'
  ) THEN
    RAISE EXCEPTION 'Already applied (authority:sarah_azmi_shared_pool_june_v1).';
  END IF;
END $$;

DELETE FROM daycare_sessions
WHERE package_id = '71bd8028-0b60-4635-bd30-461dce677ca9'::uuid;

DELETE FROM service_credits
WHERE id = '71bd8028-0b60-4635-bd30-461dce677ca9'::uuid;

UPDATE invoices
SET notes = 'Daycare package purchase | tracker=INV-2026-03584 | raw_type=30 Day Ticket | shared_pool_30_combined | pets=Luna,Rocky | authority:sarah_azmi_shared_pool_june_v1'
WHERE id = 'd96e0d95-a377-499e-958b-a14847acdc6f'::uuid;

UPDATE purchase_groups
SET pet_count = 2,
    multi_pet_discount_applied = COALESCE(multi_pet_discount_applied, 10)
WHERE id = '0110206d-7651-4f70-b5db-29518020c953'::uuid;

UPDATE invoice_line_items
SET description = '30 Day Ticket — Luna / Rocky shared pool (INV-2026-03584)'
WHERE invoice_id = 'd96e0d95-a377-499e-958b-a14847acdc6f'::uuid;

INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  'b8e4c1a2-3f7d-4e91-9a6b-2d5f8c0e1b3a',
  'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e',
  'daycare_full_day',
  30, 5, '2026-12-17',
  'package_purchase',
  'd96e0d95-a377-499e-958b-a14847acdc6f',
  '0110206d-7651-4f70-b5db-29518020c953',
  false, 'active', '2026-06-17 00:00:00+00'
);

-- Remove any stale June 11 Luna row before re-inserting on the new pool.
DELETE FROM daycare_sessions
WHERE owner_id = '91d17004-4abf-41a9-a8b1-3dafbdf9c54b'::uuid
  AND pet_id = 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e'::uuid
  AND session_date = '2026-06-11'::date;

INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at) VALUES
  ('c1d2e3f4-a5b6-4789-8abc-def012345601', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', 'b8e4c1a2-3f7d-4e91-9a6b-2d5f8c0e1b3a', '2026-06-11', true, 'tracker=INV-2026-03584 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_june_v1', '2026-06-11 09:00:00+00'),
  ('c1d2e3f4-a5b6-4789-8abc-def012345602', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', 'b8e4c1a2-3f7d-4e91-9a6b-2d5f8c0e1b3a', '2026-06-17', true, 'tracker=INV-2026-03584 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_june_v1', '2026-06-17 09:00:00+00'),
  ('c1d2e3f4-a5b6-4789-8abc-def012345603', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', 'b8e4c1a2-3f7d-4e91-9a6b-2d5f8c0e1b3a', '2026-06-17', true, 'tracker=INV-2026-03584 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_june_v1', '2026-06-17 09:00:00+00'),
  ('c1d2e3f4-a5b6-4789-8abc-def012345604', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', 'b8e4c1a2-3f7d-4e91-9a6b-2d5f8c0e1b3a', '2026-06-19', true, 'tracker=INV-2026-03584 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_june_v1', '2026-06-19 09:00:00+00'),
  ('c1d2e3f4-a5b6-4789-8abc-def012345605', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', 'b8e4c1a2-3f7d-4e91-9a6b-2d5f8c0e1b3a', '2026-06-19', true, 'tracker=INV-2026-03584 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_june_v1', '2026-06-19 09:00:00+00');

COMMIT;

-- Verification
SELECT
  COALESCE((regexp_match(i.notes, 'tracker=([^ |]+)'))[1], i.invoice_number) AS tracker,
  p.name AS anchor_pet,
  sc.units_total,
  sc.units_consumed,
  sc.units_total - sc.units_consumed AS remaining,
  sc.status,
  i.notes LIKE '%shared_pool_30_combined%' AS is_shared_pool,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS linked_sessions
FROM service_credits sc
JOIN pets p ON p.id = sc.pet_id
JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
JOIN invoices i ON i.id = pg.invoice_id
WHERE p.owner_id = '91d17004-4abf-41a9-a8b1-3dafbdf9c54b'::uuid
  AND sc.service_code = 'daycare_full_day'
ORDER BY sc.created_at;
