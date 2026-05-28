-- Tamima Kronfol: hide superseded daycare package credits so each dog shows only
-- the current May 2026 purchase (PKG-Invoice-Lotus-Meimei-Rocky-…-May-23-2026).
-- Historical invoices/credits remain for audit; status -> depleted removes them from
-- active package pickers (UI filters active/expired with remaining).
--
-- Does NOT delete sessions or change units_consumed on old credits.

BEGIN;

DO $$
DECLARE
  v_owner_id uuid := '9d625d7c-d7f2-42f7-8198-03fa42b381ae';
  v_guard text := 'authority:tamima_kronfol_superseded_v1';
  v_depleted int;
BEGIN
  -- Unlink orphan sessions on the new package (authority: 0 used; had 2026-05-26 check-ins)
  UPDATE daycare_sessions ds
  SET package_id = NULL,
      notes = coalesce(ds.notes, '') || ' | ' || v_guard || ': unlinked from new package (use current ticket)'
  WHERE ds.package_id IN (
    '7c29d7af-59b1-4f11-90ef-cca31b1fcf31'::uuid,
    'f7b407ea-84c2-40f3-9ddd-2f223fa0848d'::uuid,
    'b00c1546-6046-4bfa-b1aa-87a8d56cf053'::uuid
  );

  UPDATE service_credits
  SET status = 'depleted'
  WHERE status IN ('active', 'expired')
    AND id IN (
      '30a99fab-a83a-4d5f-a360-61b352d38781'::uuid,
      '9230cbf2-f060-41e2-a75f-c9e7d1be6b89'::uuid,
      'c08d8078-50d3-47f2-9666-73d9aeb5d995'::uuid,
      'bb7b8233-45b8-44c3-b721-e534d3bb4da3'::uuid,
      '8ac2402c-8618-493a-a8aa-86f1ec238aee'::uuid,
      '8b2d8d3d-6025-489b-b120-536acfbf147d'::uuid,
      'ef98bf21-2831-48b9-baeb-07749043d45c'::uuid,
      'f3a86f6d-9707-4c8b-b938-6c41889e2d5c'::uuid,
      'b6325b17-0e39-4288-8315-5574489b8e3f'::uuid,
      'ce5f08fc-8191-41a5-ac66-e1eb9fd9eca4'::uuid,
      '72ef379f-8e28-41a2-ad95-b7122f98b4f0'::uuid,
      '16c74058-952d-4fa6-91f9-172c54c67a6a'::uuid,
      'fa2a79fa-bff1-4779-b177-1348d19f573f'::uuid,
      'be176ed0-3df5-4a07-ac79-418dda4e0cb2'::uuid,
      'b4334220-3726-4b08-bb67-845173a45c25'::uuid,
      '6d5a4089-7128-4199-894d-22a0fc0425ea'::uuid,
      '8cc798bb-5316-4e6e-9fca-25266334ef1d'::uuid,
      '2a7ba8bd-635f-40aa-b966-865fdfe279e9'::uuid,
      '3e47b687-b2bf-4c06-8437-49c7018a13c5'::uuid,
      'd7d16d9b-b788-49d0-878b-693cd6d4dfda'::uuid,
      '654d31a2-e957-4565-9cb4-ebd832d61902'::uuid
    );

  GET DIAGNOSTICS v_depleted = ROW_COUNT;
  RAISE NOTICE 'Superseded credits marked depleted: %', v_depleted;

  UPDATE invoices i
  SET notes = coalesce(i.notes, '') || ' | ' || v_guard
  WHERE i.notes ~ 'tracker='
    AND i.notes NOT LIKE '%' || v_guard || '%'
    AND i.id IN (
      SELECT DISTINCT pg.invoice_id
      FROM purchase_groups pg
      JOIN service_credits sc ON sc.purchase_group_id = pg.id
      JOIN pets p ON p.id = sc.pet_id
      WHERE p.owner_id = v_owner_id
        AND sc.status = 'depleted'
        AND pg.invoice_id IS NOT NULL
    );
END $$;

COMMIT;

-- Verification: active packages with remaining (should be 3 rows — May 2026 only)
SELECT
  p.name AS pet_name,
  (regexp_match(i.notes, 'tracker=([^ |]+)'))[1] AS tracker_id,
  sc.units_total,
  sc.units_consumed,
  sc.units_total - sc.units_consumed AS remaining,
  sc.status,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS sessions_on_credit
FROM service_credits sc
JOIN pets p ON p.id = sc.pet_id
JOIN owners o ON o.id = p.owner_id
LEFT JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
LEFT JOIN invoices i ON i.id = pg.invoice_id
WHERE o.id = '9d625d7c-d7f2-42f7-8198-03fa42b381ae'::uuid
  AND sc.service_code IN ('daycare_full_day', 'daycare_half_day', 'daycare_hourly')
  AND sc.is_bonus = false
  AND sc.status IN ('active', 'expired')
  AND sc.units_total > sc.units_consumed
ORDER BY p.name;
