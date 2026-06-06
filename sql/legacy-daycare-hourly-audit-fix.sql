-- Legacy daycare hourly billing — audit + one-shot fixes
-- Run in Supabase SQL editor. Samer runs writes; paste verification results back.
--
-- Context: owner-profile "Pending hourly daycare billing" shows when a checked-in
-- hourly session lacks HOURLY_INVOICED in notes. Legacy ingest sometimes leaves
-- gaps (wallet correction voided invoices, ingest stopped mid-batch).

-- ── 1) AUDIT: owners with legacy hourly issues ───────────────────────────────

SELECT o.first_name,
       o.last_name,
       o.phone,
       COUNT(*) FILTER (
         WHERE ds.notes LIKE '%BILLING_PATH:hourly%'
           AND ds.notes NOT LIKE '%HOURLY_INVOICED:%'
       ) AS pending_hourly,
       COUNT(*) FILTER (
         WHERE i.status = 'voided'
       ) AS voided_invoice_ref,
       COUNT(*) AS legacy_hourly_sessions
FROM daycare_sessions ds
JOIN owners o ON o.id = ds.owner_id
LEFT JOIN invoices i
  ON i.id::text = substring(ds.notes FROM 'HOURLY_INVOICED:([^\n]+)')
WHERE ds.checked_in = true
  AND ds.notes LIKE '%LEGACY:%'
  AND ds.notes LIKE '%BILLING_PATH:hourly%'
GROUP BY o.id, o.first_name, o.last_name, o.phone
HAVING COUNT(*) FILTER (
         WHERE ds.notes LIKE '%BILLING_PATH:hourly%'
           AND ds.notes NOT LIKE '%HOURLY_INVOICED:%'
       ) > 0
    OR COUNT(*) FILTER (WHERE i.status = 'voided') > 0
ORDER BY pending_hourly DESC, voided_invoice_ref DESC;

-- Detail rows (sessions that still need attention)
SELECT o.first_name,
       o.last_name,
       o.phone,
       ds.session_date,
       p.name AS pet_name,
       CASE
         WHEN ds.notes LIKE '%BILLING_PATH:hourly%'
          AND ds.notes NOT LIKE '%HOURLY_INVOICED:%' THEN 'pending-hourly'
         WHEN i.status = 'voided' THEN 'voided-invoice-ref'
         ELSE 'ok'
       END AS issue,
       substring(ds.notes FROM 'HOURLY_INVOICED:([^\n]+)') AS invoiced_ref,
       i.invoice_number,
       i.status AS invoice_status
FROM daycare_sessions ds
JOIN owners o ON o.id = ds.owner_id
JOIN pets p ON p.id = ds.pet_id
LEFT JOIN invoices i
  ON i.id::text = substring(ds.notes FROM 'HOURLY_INVOICED:([^\n]+)')
WHERE ds.checked_in = true
  AND ds.notes LIKE '%LEGACY:%'
  AND ds.notes LIKE '%BILLING_PATH:hourly%'
  AND (
    (ds.notes NOT LIKE '%HOURLY_INVOICED:%')
    OR i.status = 'voided'
  )
ORDER BY o.last_name, o.first_name, ds.session_date;

-- ── 2) FIX A: missing HOURLY_INVOICED (clears profile banner) ───────────────
-- Idempotent: only touches sessions without the marker.

-- UPDATE daycare_sessions ds
-- SET notes = ds.notes || E'\nHOURLY_INVOICED:' ||
--   CASE
--     WHEN ds.notes LIKE '%LEGACY:92834%' THEN 'legacy-92834-settled'
--     ELSE 'legacy-settled'
--   END
-- WHERE ds.checked_in = true
--   AND ds.notes LIKE '%LEGACY:%'
--   AND ds.notes LIKE '%BILLING_PATH:hourly%'
--   AND ds.notes NOT LIKE '%HOURLY_INVOICED:%';

-- ── 3) FIX B: HOURLY_INVOICED points at a voided invoice ─────────────────────
-- Replaces the marker with a legacy-settled sentinel (banner already hidden,
-- but avoids dead invoice links from session notes).

-- UPDATE daycare_sessions ds
-- SET notes = regexp_replace(
--   ds.notes,
--   E'HOURLY_INVOICED:[^\n]+',
--   CASE
--     WHEN ds.notes LIKE '%LEGACY:92834%' THEN 'HOURLY_INVOICED:legacy-92834-settled'
--     ELSE 'HOURLY_INVOICED:legacy-settled'
--   END
-- )
-- WHERE ds.id IN (
--   SELECT ds2.id
--   FROM daycare_sessions ds2
--   JOIN invoices i ON i.id::text = substring(ds2.notes FROM 'HOURLY_INVOICED:([^\n]+)')
--   WHERE ds2.checked_in = true
--     AND ds2.notes LIKE '%LEGACY:%'
--     AND ds2.notes LIKE '%BILLING_PATH:hourly%'
--     AND i.status = 'voided'
-- );

-- ── 4) VERIFICATION (expect 0 rows) ──────────────────────────────────────────

SELECT o.first_name,
       o.last_name,
       ds.session_date,
       p.name AS pet_name,
       CASE
         WHEN ds.notes LIKE '%BILLING_PATH:hourly%'
          AND ds.notes NOT LIKE '%HOURLY_INVOICED:%' THEN 'pending-hourly'
         WHEN i.status = 'voided' THEN 'voided-invoice-ref'
         ELSE 'unexpected'
       END AS issue
FROM daycare_sessions ds
JOIN owners o ON o.id = ds.owner_id
JOIN pets p ON p.id = ds.pet_id
LEFT JOIN invoices i
  ON i.id::text = substring(ds.notes FROM 'HOURLY_INVOICED:([^\n]+)')
WHERE ds.checked_in = true
  AND ds.notes LIKE '%LEGACY:%'
  AND ds.notes LIKE '%BILLING_PATH:hourly%'
  AND (
    (ds.notes NOT LIKE '%HOURLY_INVOICED:%')
    OR i.status = 'voided'
  )
ORDER BY o.last_name, o.first_name, ds.session_date;
