-- Backfill daycare_sessions.package_id: legacy package_definitions UUID → service_credits.id
--
-- Problem: migrated sessions store package_id = package_definitions.id and embed
--   Legacy migration | tracker=PKG-xxxxx | slot=U#
-- The package planner (useSessionsByPackage) filters on service_credits.id, so
-- usage history is invisible even when units_consumed is correct.
--
-- Resolution: parse full tracker token from notes (supports PKG-78408-78517 style
-- suffixes — do NOT use PKG-[0-9]+ only), join invoice → purchase_group → credit
-- on matching pet_id, update only when exactly one credit matches.
--
-- Run PREVIEW first, then APPLY, then VERIFICATION.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PREVIEW — counts before apply
-- ═══════════════════════════════════════════════════════════════════════════════

WITH legacy_sessions AS (
  SELECT
    ds.id,
    ds.pet_id,
    ds.package_id AS old_package_id,
    (regexp_match(ds.notes, 'tracker=([^ |]+)'))[1] AS tracker_id
  FROM daycare_sessions ds
  WHERE ds.package_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM service_credits sc WHERE sc.id = ds.package_id
    )
    AND ds.notes ~ 'tracker=PKG-'
),
credit_map AS (
  SELECT
    ls.id AS session_id,
    sc.id AS credit_id,
    sc.service_code,
    COUNT(*) OVER (PARTITION BY ls.id) AS match_count
  FROM legacy_sessions ls
  JOIN invoices i
    ON i.notes LIKE 'Legacy daycare package purchase | tracker=' || ls.tracker_id || ' |%'
  JOIN purchase_groups pg ON pg.invoice_id = i.id
  JOIN service_credits sc
    ON sc.purchase_group_id = pg.id
   AND sc.pet_id = ls.pet_id
)
SELECT
  (SELECT COUNT(*) FROM legacy_sessions) AS legacy_sessions_total,
  COUNT(*) FILTER (WHERE cm.match_count = 1) AS will_update,
  COUNT(*) FILTER (WHERE cm.match_count > 1) AS ambiguous_do_not_update,
  (SELECT COUNT(*) FROM legacy_sessions ls
   WHERE NOT EXISTS (
     SELECT 1 FROM credit_map cm
     WHERE cm.session_id = ls.id AND cm.match_count = 1
   )) AS unmatched_left_on_package_def
FROM credit_map cm;

-- Sample rows that will update (first 20)
WITH legacy_sessions AS (
  SELECT
    ds.id,
    ds.pet_id,
    ds.session_date,
    ds.package_id AS old_package_id,
    (regexp_match(ds.notes, 'tracker=([^ |]+)'))[1] AS tracker_id
  FROM daycare_sessions ds
  WHERE ds.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM service_credits sc WHERE sc.id = ds.package_id)
    AND ds.notes ~ 'tracker=PKG-'
),
credit_map AS (
  SELECT
    ls.id AS session_id,
    ls.session_date,
    ls.tracker_id,
    ls.old_package_id,
    sc.id AS credit_id,
    sc.units_total,
    sc.units_consumed,
    COUNT(*) OVER (PARTITION BY ls.id) AS match_count
  FROM legacy_sessions ls
  JOIN invoices i
    ON i.notes LIKE 'Legacy daycare package purchase | tracker=' || ls.tracker_id || ' |%'
  JOIN purchase_groups pg ON pg.invoice_id = i.id
  JOIN service_credits sc
    ON sc.purchase_group_id = pg.id
   AND sc.pet_id = ls.pet_id
)
SELECT session_id, tracker_id, session_date, old_package_id, credit_id, units_consumed, units_total
FROM credit_map
WHERE match_count = 1
ORDER BY tracker_id, session_date
LIMIT 20;

-- Spot-check: PKG-90306, PKG-91164, PKG-92189
WITH legacy_sessions AS (
  SELECT
    ds.id,
    ds.pet_id,
    ds.session_date,
    (regexp_match(ds.notes, 'tracker=([^ |]+)'))[1] AS tracker_id
  FROM daycare_sessions ds
  WHERE ds.notes ~ 'tracker=PKG-(90306|91164|92189)([^0-9]|$)'
    AND NOT EXISTS (SELECT 1 FROM service_credits sc WHERE sc.id = ds.package_id)
),
credit_map AS (
  SELECT
    ls.*,
    sc.id AS credit_id,
    COUNT(*) OVER (PARTITION BY ls.id) AS match_count
  FROM legacy_sessions ls
  JOIN invoices i
    ON i.notes LIKE 'Legacy daycare package purchase | tracker=' || ls.tracker_id || ' |%'
  JOIN purchase_groups pg ON pg.invoice_id = i.id
  JOIN service_credits sc
    ON sc.purchase_group_id = pg.id
   AND sc.pet_id = ls.pet_id
)
SELECT tracker_id, COUNT(*) AS sessions, COUNT(*) FILTER (WHERE match_count = 1) AS resolvable
FROM credit_map
GROUP BY tracker_id
ORDER BY tracker_id;

-- Unmatched sessions (manual review) — expect ~46 rows (PKG-84262-84380, no invoice)
WITH legacy_sessions AS (
  SELECT
    ds.id,
    ds.pet_id,
    ds.session_date,
    (regexp_match(ds.notes, 'tracker=([^ |]+)'))[1] AS tracker_id
  FROM daycare_sessions ds
  WHERE ds.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM service_credits sc WHERE sc.id = ds.package_id)
    AND ds.notes ~ 'tracker=PKG-'
),
credit_map AS (
  SELECT
    ls.id AS session_id,
    COUNT(*) OVER (PARTITION BY ls.id) AS match_count
  FROM legacy_sessions ls
  JOIN invoices i
    ON i.notes LIKE 'Legacy daycare package purchase | tracker=' || ls.tracker_id || ' |%'
  JOIN purchase_groups pg ON pg.invoice_id = i.id
  JOIN service_credits sc
    ON sc.purchase_group_id = pg.id
   AND sc.pet_id = ls.pet_id
)
SELECT ls.tracker_id, COUNT(*) AS sessions
FROM legacy_sessions ls
WHERE NOT EXISTS (
  SELECT 1 FROM credit_map cm
  WHERE cm.session_id = ls.id AND cm.match_count = 1
)
GROUP BY ls.tracker_id
ORDER BY sessions DESC;


-- ═══════════════════════════════════════════════════════════════════════════════
-- APPLY — set package_id to service_credits.id (idempotent; safe to re-run)
-- ═══════════════════════════════════════════════════════════════════════════════

WITH legacy_sessions AS (
  SELECT
    ds.id,
    ds.pet_id,
    (regexp_match(ds.notes, 'tracker=([^ |]+)'))[1] AS tracker_id
  FROM daycare_sessions ds
  WHERE ds.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM service_credits sc WHERE sc.id = ds.package_id)
    AND ds.notes ~ 'tracker=PKG-'
),
credit_map AS (
  SELECT
    ls.id AS session_id,
    sc.id AS credit_id,
    COUNT(*) OVER (PARTITION BY ls.id) AS match_count
  FROM legacy_sessions ls
  JOIN invoices i
    ON i.notes LIKE 'Legacy daycare package purchase | tracker=' || ls.tracker_id || ' |%'
  JOIN purchase_groups pg ON pg.invoice_id = i.id
  JOIN service_credits sc
    ON sc.purchase_group_id = pg.id
   AND sc.pet_id = ls.pet_id
),
to_update AS (
  SELECT session_id, credit_id
  FROM credit_map
  WHERE match_count = 1
)
UPDATE daycare_sessions ds
SET package_id = u.credit_id
FROM to_update u
WHERE ds.id = u.session_id
  AND ds.package_id IS DISTINCT FROM u.credit_id;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — paste results after APPLY
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT
  COUNT(*) AS total_sessions,
  COUNT(*) FILTER (
    WHERE package_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM service_credits sc WHERE sc.id = package_id)
  ) AS package_id_is_service_credit,
  COUNT(*) FILTER (
    WHERE package_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM package_definitions pd WHERE pd.id = package_id)
  ) AS package_id_still_package_def,
  COUNT(*) FILTER (WHERE package_id IS NULL) AS package_id_null
FROM daycare_sessions;

-- PKG spot-check: planner should now see sessions on credit id
SELECT
  (regexp_match(ds.notes, 'tracker=([^ |]+)'))[1] AS tracker_id,
  sc.id AS credit_id,
  COUNT(*) FILTER (WHERE ds.package_id = sc.id) AS sessions_on_credit,
  COUNT(*) FILTER (WHERE ds.package_id <> sc.id) AS sessions_not_on_credit,
  sc.units_consumed,
  sc.units_total
FROM daycare_sessions ds
JOIN invoices i
  ON i.notes LIKE 'Legacy daycare package purchase | tracker=' ||
     (regexp_match(ds.notes, 'tracker=([^ |]+)'))[1] || ' |%'
JOIN purchase_groups pg ON pg.invoice_id = i.id
JOIN service_credits sc ON sc.purchase_group_id = pg.id AND sc.pet_id = ds.pet_id
WHERE ds.notes ~ 'tracker=PKG-(90306|91164|92189)([^0-9]|$)'
GROUP BY 1, 2, sc.units_consumed, sc.units_total
ORDER BY 1, 2;
