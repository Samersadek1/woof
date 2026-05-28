-- PKG-84262-84380 — Pepe Sameni (Shervin CL001015) + Bobby Chamard (Mailys CL000987)
-- Authority: combined invoice xlsx daycare sheet — Pepe 15 used, Bobby 30 used.
-- Prefer: node scripts/fix-pepe-bobby-pkg-84262-84380.mjs --apply
-- This file documents IDs + verification SELECTs for Samer.

-- ═══ Verification (run after apply) ═══

SELECT sc.id AS credit_id,
       p.name AS pet,
       o.first_name || ' ' || o.last_name AS owner,
       o.source_external_id,
       sc.units_total,
       sc.units_consumed,
       sc.units_total - sc.units_consumed AS remaining,
       i.invoice_number,
       substring(i.notes from 'receipt=([0-9]+)') AS receipt
FROM service_credits sc
JOIN pets p ON p.id = sc.pet_id
JOIN owners o ON o.id = p.owner_id
LEFT JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
LEFT JOIN invoices i ON i.id = pg.invoice_id
WHERE sc.id IN (
  '5729a11a-22c7-44a2-9e51-f4cf0422e9aa',
  'e8e20dbd-bf7b-440f-adfb-4a2801b46e76'
);
-- Expect: Pepe / Shervin CL001015  30/15 (15 left)  receipt 84262
--         Bobby / Mailys CL000987  30/30 (0 left)    receipt 84380

SELECT p.source_external_id, p.name, p.active, p.status, o.source_external_id AS owner_legacy
FROM pets p
JOIN owners o ON o.id = p.owner_id
WHERE p.id IN (
  '12774ed9-d0de-4e3f-8466-b94185aaee4a',
  '028e18a5-3258-4101-a6f2-8477f9546136',
  'b451afb5-517a-408b-b379-ce63d7bd03a3',
  '6813ee07-79b9-4810-8f64-e409bc9c7989'
)
ORDER BY p.active DESC, p.name;

SELECT
  COUNT(*) FILTER (WHERE ds.pet_id = '12774ed9-d0de-4e3f-8466-b94185aaee4a') AS pepe_sessions,
  COUNT(*) FILTER (WHERE ds.pet_id = '028e18a5-3258-4101-a6f2-8477f9546136') AS bobby_sessions,
  COUNT(*) FILTER (WHERE ds.pet_id = '125e4049-dc74-44cd-a58b-fd2b14d66c9d') AS orphan_wrong_pet
FROM daycare_sessions ds
WHERE ds.notes LIKE '%tracker=PKG-84262-84380%';
