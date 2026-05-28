-- Tamima PKG-92359: add 6 missing daycare sessions (parser missed "May DD Pet" rows).
-- Each row = 1 day from the shared 30-day pool (2 pets same day = 2 days).
-- Guard: authority:tamima_kronfol_92359_missing_sessions_v1

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM daycare_sessions
    WHERE notes LIKE '%authority:tamima_kronfol_92359_missing_sessions_v1%'
  ) THEN
    RAISE EXCEPTION 'Already applied (authority:tamima_kronfol_92359_missing_sessions_v1).';
  END IF;
END $$;

INSERT INTO daycare_sessions (id, owner_id, pet_id, package_id, session_date, checked_in, notes, created_at)
VALUES
  ('2d1b9360-2aba-4e60-9e29-1219860af483', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', '55c6cfad-7aec-4bc0-9424-906fa26762cd', '2026-05-16', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_92359_missing_sessions_v1', '2026-05-16 09:00:00+00'),
  ('f0ab800d-0698-4447-8ad7-01cb0f958dc7', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', '55c6cfad-7aec-4bc0-9424-906fa26762cd', '2026-05-19', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_92359_missing_sessions_v1', '2026-05-19 09:00:00+00'),
  ('9279fa94-9c6d-471c-b916-5535494fb1a9', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', '55c6cfad-7aec-4bc0-9424-906fa26762cd', '2026-05-19', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_92359_missing_sessions_v1', '2026-05-19 09:00:00+00'),
  ('d567e32c-cf6c-4fad-b17e-15b07b086b2c', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', 'bbc628cd-394a-4bcd-84c1-4f34d5047de8', '55c6cfad-7aec-4bc0-9424-906fa26762cd', '2026-05-19', true, 'tracker=PKG-92359 | shared_pool | pet=Mei Mei | authority:tamima_kronfol_92359_missing_sessions_v1', '2026-05-19 09:00:00+00'),
  ('2074c990-f205-47d2-b0c8-34113a50e347', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '31d18899-4867-4524-bfdc-35069e33436e', '55c6cfad-7aec-4bc0-9424-906fa26762cd', '2026-05-23', true, 'tracker=PKG-92359 | shared_pool | pet=Lotus | authority:tamima_kronfol_92359_missing_sessions_v1', '2026-05-23 09:00:00+00'),
  ('6f76a621-8125-4079-b9c7-1aac1ad02d69', '9d625d7c-d7f2-42f7-8198-03fa42b381ae', '02389f3b-03e2-4385-a95d-cf515d946653', '55c6cfad-7aec-4bc0-9424-906fa26762cd', '2026-05-23', true, 'tracker=PKG-92359 | shared_pool | pet=Rocky | authority:tamima_kronfol_92359_missing_sessions_v1', '2026-05-23 09:00:00+00');

UPDATE service_credits
SET units_consumed = 30, status = 'depleted'
WHERE id = '55c6cfad-7aec-4bc0-9424-906fa26762cd';

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
