-- Tamima Kronfol (CL000284): align service_credits with
-- exports/Tamima_Kronfol_Invoice_Usage_Analysis.xlsx (Per Pet Packages sheet).
-- Idempotent: skips when balances already match; stamps invoice guard note once.
--
-- Live audit 2026-05-28: all 24 rows already matched authority balances;
-- this script is safe to re-run after other environments or regressions.

BEGIN;

DO $$
DECLARE
  v_owner_id uuid := '9d625d7c-d7f2-42f7-8198-03fa42b381ae';
  v_guard text := 'authority:tamima_kronfol_v1';
  v_updated int := 0;
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM owners WHERE id = v_owner_id) THEN
    RAISE EXCEPTION 'Owner % not found', v_owner_id;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('30a99fab-a83a-4d5f-a360-61b352d38781'::uuid, 30, 13),
      ('9230cbf2-f060-41e2-a75f-c9e7d1be6b89'::uuid, 30, 13),
      ('c08d8078-50d3-47f2-9666-73d9aeb5d995'::uuid, 30, 13),
      ('bb7b8233-45b8-44c3-b721-e534d3bb4da3'::uuid, 30, 13),
      ('8ac2402c-8618-493a-a8aa-86f1ec238aee'::uuid, 30, 13),
      ('8b2d8d3d-6025-489b-b120-536acfbf147d'::uuid, 30, 13),
      ('ef98bf21-2831-48b9-baeb-07749043d45c'::uuid, 30, 12),
      ('f3a86f6d-9707-4c8b-b938-6c41889e2d5c'::uuid, 30, 12),
      ('b6325b17-0e39-4288-8315-5574489b8e3f'::uuid, 30, 12),
      ('ce5f08fc-8191-41a5-ac66-e1eb9fd9eca4'::uuid, 30, 14),
      ('72ef379f-8e28-41a2-ad95-b7122f98b4f0'::uuid, 30, 14),
      ('16c74058-952d-4fa6-91f9-172c54c67a6a'::uuid, 30, 14),
      ('fa2a79fa-bff1-4779-b177-1348d19f573f'::uuid, 30, 30),
      ('be176ed0-3df5-4a07-ac79-418dda4e0cb2'::uuid, 30, 30),
      ('b4334220-3726-4b08-bb67-845173a45c25'::uuid, 30, 30),
      ('6d5a4089-7128-4199-894d-22a0fc0425ea'::uuid, 30, 12),
      ('8cc798bb-5316-4e6e-9fca-25266334ef1d'::uuid, 30, 12),
      ('2a7ba8bd-635f-40aa-b966-865fdfe279e9'::uuid, 30, 12),
      ('3e47b687-b2bf-4c06-8437-49c7018a13c5'::uuid, 30, 30),
      ('d7d16d9b-b788-49d0-878b-693cd6d4dfda'::uuid, 30, 30),
      ('654d31a2-e957-4565-9cb4-ebd832d61902'::uuid, 30, 30),
      ('7c29d7af-59b1-4f11-90ef-cca31b1fcf31'::uuid, 30, 0),
      ('f7b407ea-84c2-40f3-9ddd-2f223fa0848d'::uuid, 30, 0),
      ('b00c1546-6046-4bfa-b1aa-87a8d56cf053'::uuid, 30, 0)
    ) AS t(credit_id, units_total, units_consumed)
  LOOP
    UPDATE service_credits sc
    SET
      units_total = r.units_total,
      units_consumed = r.units_consumed,
      status = CASE
        WHEN r.units_consumed >= r.units_total THEN 'exhausted'
        ELSE 'active'
      END
    WHERE sc.id = r.credit_id
      AND (
        sc.units_total IS DISTINCT FROM r.units_total
        OR sc.units_consumed IS DISTINCT FROM r.units_consumed
      );

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'service_credits rows updated: %', v_updated;

  -- Stamp guard on Tamima package invoices (tracker= in notes)
  UPDATE invoices i
  SET notes = COALESCE(i.notes, '') || ' | ' || v_guard
  WHERE i.id IN (
    SELECT DISTINCT pg.invoice_id
    FROM purchase_groups pg
    JOIN service_credits sc ON sc.purchase_group_id = pg.id
    JOIN pets p ON p.id = sc.pet_id
    WHERE p.owner_id = v_owner_id
      AND pg.invoice_id IS NOT NULL
  )
  AND i.notes IS NOT NULL
  AND i.notes ~ 'tracker='
  AND i.notes NOT LIKE '%' || v_guard || '%';
END $$;

COMMIT;

-- Verification (paste after run)
SELECT
  (regexp_match(i.notes, 'tracker=([^ |]+)'))[1] AS tracker_id,
  p.name AS pet_name,
  sc.id AS credit_id,
  sc.units_total,
  sc.units_consumed,
  sc.units_total - sc.units_consumed AS remaining,
  sc.status,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS session_count,
  i.notes LIKE '%authority:tamima_kronfol_v1%' AS guard_applied
FROM service_credits sc
JOIN pets p ON p.id = sc.pet_id
JOIN owners o ON o.id = p.owner_id
LEFT JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
LEFT JOIN invoices i ON i.id = pg.invoice_id
WHERE o.id = '9d625d7c-d7f2-42f7-8198-03fa42b381ae'::uuid
  AND i.notes ~ 'tracker='
ORDER BY tracker_id, p.name;
