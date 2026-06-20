-- Sarah Azmi (CL000668): rebuild PKG-91073 as ONE shared 30-day pool for Luna + Rocky.
-- Authority: staff usage sheet "Luna/Rocky Old Package" (30 visits, fully used).
-- Model matches Tamima Kronfol: each pet visit = 1 day from the shared pool.
-- Guard: authority:sarah_azmi_shared_pool_v1
--
-- Does NOT touch the June 2026 replacement package (invoice d96e0d95 / credit 71bd8028).

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE id = '6a0cb6f5-2b0f-422c-aacd-3be34939c923'::uuid
      AND notes LIKE '%authority:sarah_azmi_shared_pool_v1%'
  ) THEN
    RAISE EXCEPTION 'Already applied (authority:sarah_azmi_shared_pool_v1).';
  END IF;
END $$;

-- Remove duplicate / mis-linked sessions on the old per-dog credits.
DELETE FROM daycare_sessions
WHERE package_id IN (
  'e7793858-d870-4161-92c2-7ef4bf786677'::uuid,
  'd422d208-8a2b-485f-b855-3553e9b1500c'::uuid
);

DELETE FROM service_credits
WHERE id IN (
  'e7793858-d870-4161-92c2-7ef4bf786677'::uuid,
  'd422d208-8a2b-485f-b855-3553e9b1500c'::uuid
);

UPDATE invoices
SET notes = 'Legacy daycare package purchase | tracker=PKG-91073 | raw_type=30 Day Ticket | shared_pool_30_combined | pets=Luna,Rocky | authority:sarah_azmi_shared_pool_v1'
WHERE id = '6a0cb6f5-2b0f-422c-aacd-3be34939c923'::uuid;

UPDATE invoice_line_items
SET description = '30 Day Ticket — Luna / Rocky shared pool (PKG-91073)'
WHERE invoice_id = '6a0cb6f5-2b0f-422c-aacd-3be34939c923'::uuid;

-- One shared credit (anchored on Luna), fully depleted 30/30.
INSERT INTO service_credits (
  id, pet_id, service_code, units_total, units_consumed, expires_at,
  source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
) VALUES (
  '69ac4ac5-e603-4999-ba62-72c96b1efbd5',
  'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e',
  'daycare_full_day',
  30, 30, '2026-08-20',
  'package_purchase',
  '6a0cb6f5-2b0f-422c-aacd-3be34939c923',
  '458ceda2-4403-4cc9-beba-1fdbcde76dd6',
  false, 'depleted', '2026-02-20 00:00:00+00'
);

-- Authority usage (each row = 1 day from shared pool).
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at) VALUES
  ('259a4041-6ffb-4a1b-b7a0-67c3cb9c9e2d', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-02-20', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-02-20 09:00:00+00'),
  ('d328073a-794f-404d-b168-b05016f4fb63', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-02-20', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-02-20 09:00:00+00'),
  ('aa90f2f1-3145-47b3-9c81-387f9d4152fe', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-02-24', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-02-24 09:00:00+00'),
  ('c5fdec10-20c5-44f7-b178-d11f4b258a02', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-02-24', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-02-24 09:00:00+00'),
  ('fd43f150-2e8c-4fa0-b9e8-f43d41bc7f8d', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-04', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-03-04 09:00:00+00'),
  ('53e2fbff-27d3-4632-b9ab-e5f487b4d332', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-04', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-03-04 09:00:00+00'),
  ('eeb1b11f-63c7-44fe-88bf-52a253519fc9', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-10', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-03-10 09:00:00+00'),
  ('7e17dc54-8148-49ba-9065-eb97635bac85', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-10', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-03-10 09:00:00+00'),
  ('4498ad3f-f905-4581-9836-8d505da80c29', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-16', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-03-16 09:00:00+00'),
  ('4e0833f6-678d-49f2-96bf-a6aa81527168', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-20', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-03-20 09:00:00+00'),
  ('c56e2fec-e510-4b58-8696-cdc76f1c0962', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-25', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-03-25 09:00:00+00'),
  ('8553db79-5a4d-4080-bea7-1984b637bb4e', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-25', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-03-25 09:00:00+00'),
  ('c4b2ae8b-59d3-4054-bb47-f59c27325a7b', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-31', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-03-31 09:00:00+00'),
  ('5291b1c7-462f-4cff-9bc7-7df51dc0955c', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-03-31', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-03-31 09:00:00+00'),
  ('d30b3e51-5a06-4bd4-8c1e-6ff08c62011a', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-04-14', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-04-14 09:00:00+00'),
  ('f5e7545d-b1a1-4d72-b054-32add6329fc9', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-04-14', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-04-14 09:00:00+00'),
  ('fb50e6aa-53ee-42a8-9143-0faa63779b3f', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-04-20', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-04-20 09:00:00+00'),
  ('6e7b8bd2-4a04-4730-9b41-4f22d7ead9c2', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-04-20', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-04-20 09:00:00+00'),
  ('a2230a9a-196d-449c-b962-53f6e7120a26', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-04-21', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-04-21 09:00:00+00'),
  ('146f71e5-a5b5-4533-8c09-fb626797f0ae', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-04-21', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-04-21 09:00:00+00'),
  ('3fe85711-bdeb-4285-b7fd-4a18803dd7e3', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-04-22', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-04-22 09:00:00+00'),
  ('d0b800ed-716e-4ff6-9cf2-4175b328f17a', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-04-22', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-04-22 09:00:00+00'),
  ('2a5ae233-2977-4a25-b8f2-25bdf1f30f62', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-05-08', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-05-08 09:00:00+00'),
  ('35def8a2-be7f-490d-bd25-90d2d428c3d7', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-05-08', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-05-08 09:00:00+00'),
  ('b299bab7-70a8-4419-be31-e552fac45998', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-05-15', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-05-15 09:00:00+00'),
  ('afc873e4-6c75-4255-b333-fe61ddfd7a8c', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-06-04', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-06-04 09:00:00+00'),
  ('07af7df5-c009-4d72-82f9-628fcf4cb828', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-06-04', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-06-04 09:00:00+00'),
  ('eec450b1-7c99-4f66-88de-fbc138608414', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', 'a765ec87-de24-4bc2-a92c-99cb8fd8fe8e', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-06-09', true, 'tracker=PKG-91073 | shared_pool | pet=Luna | authority:sarah_azmi_shared_pool_v1', '2026-06-09 09:00:00+00'),
  ('8250355e-da41-4a01-83b1-b6cb7da2ebd8', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-06-09', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-06-09 09:00:00+00'),
  ('242e8d04-9f9f-4ca7-bc61-d64fdfe40e6a', '91d17004-4abf-41a9-a8b1-3dafbdf9c54b', '63c57456-10a6-4129-8c0e-1b0f3ef94b5b', '69ac4ac5-e603-4999-ba62-72c96b1efbd5', '2026-06-11', true, 'tracker=PKG-91073 | shared_pool | pet=Rocky | authority:sarah_azmi_shared_pool_v1', '2026-06-11 09:00:00+00');

-- May 15 Rocky attended but was not charged to the old shared pool (walk-in / other billing).
INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
SELECT v.id, v.owner_id, v.pet_id, NULL, v.session_date, true, v.notes, v.created_at
FROM (VALUES
  ('dc640c38-e634-4aef-a699-b7ed71282df5'::uuid, '91d17004-4abf-41a9-a8b1-3dafbdf9c54b'::uuid, '63c57456-10a6-4129-8c0e-1b0f3ef94b5b'::uuid, '2026-05-15'::date, 'May 15 Rocky — not on PKG-91073 shared pool | authority:sarah_azmi_shared_pool_v1', '2026-05-15 09:00:00+00'::timestamptz)
) AS v(id, owner_id, pet_id, session_date, notes, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM daycare_sessions ds
  WHERE ds.owner_id = v.owner_id
    AND ds.pet_id = v.pet_id
    AND ds.session_date = v.session_date
);

COMMIT;

-- Verification: old shared pool depleted (run June script next for active package).
SELECT
  (regexp_match(i.notes, 'tracker=([^ |]+)'))[1] AS tracker,
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
