-- Backfill package credit consumption for daycare planner "Add Day" sessions that
-- were saved with package_id but never called consume_service_credit.
--
-- Safe criteria (avoids legacy migrated sessions and normal check-ins):
--   1. Package has more checked-in sessions than units_consumed (deficit).
--   2. Session has no invoice trail from the check-in flow:
--        - no invoice with service_id = session id, AND
--        - no same-day daycare invoice with a $0 "covered by" line for that owner.
--   3. Among those, consume for the newest sessions up to the deficit count
--      (planner adds are typically the most recent rows on the package).
--
-- Run the PREVIEW block first. Review rows. Then run APPLY in the same editor.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PREVIEW — sessions that APPLY will consume for (expect 0 rows after success)
-- ═══════════════════════════════════════════════════════════════════════════════

WITH session_flags AS (
  SELECT
    ds.id AS session_id,
    ds.package_id AS credit_id,
    ds.created_at,
    ds.session_date,
    ds.pet_id,
    ds.owner_id,
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.service_id = ds.id AND i.status <> 'voided'
    ) AS has_direct_invoice,
    EXISTS (
      SELECT 1
      FROM invoices i
      JOIN invoice_line_items ili ON ili.invoice_id = i.id
      WHERE i.owner_id = ds.owner_id
        AND i.service_type = 'daycare'
        AND i.status <> 'voided'
        AND ili.unit_price = 0
        AND ili.description ILIKE '%covered by%'
        AND i.created_at::date = ds.created_at::date
    ) AS has_batch_covered_invoice
  FROM daycare_sessions ds
  WHERE ds.package_id IS NOT NULL
    AND ds.checked_in = true
),
credit_deficit AS (
  SELECT
    sc.id AS credit_id,
    sc.service_code,
    sc.units_total,
    sc.units_consumed,
    sc.status,
    sc.expires_at,
    COUNT(sf.session_id) AS checked_in_sessions,
    COUNT(sf.session_id) - sc.units_consumed AS deficit
  FROM service_credits sc
  JOIN session_flags sf ON sf.credit_id = sc.id
  WHERE sc.service_code IN ('daycare_full_day', 'daycare_hourly')
  GROUP BY sc.id, sc.service_code, sc.units_total, sc.units_consumed, sc.status, sc.expires_at
  HAVING COUNT(sf.session_id) > sc.units_consumed
),
ranked AS (
  SELECT
    sf.session_id,
    sf.credit_id,
    sf.session_date,
    sf.created_at,
    sf.pet_id,
    sf.owner_id,
    cd.service_code,
    cd.units_total,
    cd.units_consumed,
    cd.deficit,
    cd.status AS credit_status,
    cd.expires_at,
    p.name AS pet_name,
    o.first_name,
    o.last_name,
    ROW_NUMBER() OVER (
      PARTITION BY sf.credit_id
      ORDER BY sf.created_at DESC
    ) AS pick_rank
  FROM session_flags sf
  JOIN credit_deficit cd ON cd.credit_id = sf.credit_id
  JOIN pets p ON p.id = sf.pet_id
  JOIN owners o ON o.id = sf.owner_id
  WHERE NOT sf.has_direct_invoice
    AND NOT sf.has_batch_covered_invoice
)
SELECT
  session_id,
  credit_id,
  pet_name,
  first_name,
  last_name,
  session_date,
  created_at,
  service_code,
  units_consumed,
  units_total,
  deficit,
  credit_status,
  expires_at,
  1 AS units_to_consume
FROM ranked
WHERE pick_rank <= deficit
ORDER BY created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- APPLY — consumes 1 unit per preview row (service_role / SQL editor)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  v_remaining int;
BEGIN
  FOR r IN
    WITH session_flags AS (
      SELECT
        ds.id AS session_id,
        ds.package_id AS credit_id,
        ds.created_at,
        ds.owner_id,
        EXISTS (
          SELECT 1 FROM invoices i
          WHERE i.service_id = ds.id AND i.status <> 'voided'
        ) AS has_direct_invoice,
        EXISTS (
          SELECT 1
          FROM invoices i
          JOIN invoice_line_items ili ON ili.invoice_id = i.id
          WHERE i.owner_id = ds.owner_id
            AND i.service_type = 'daycare'
            AND i.status <> 'voided'
            AND ili.unit_price = 0
            AND ili.description ILIKE '%covered by%'
            AND i.created_at::date = ds.created_at::date
        ) AS has_batch_covered_invoice
      FROM daycare_sessions ds
      WHERE ds.package_id IS NOT NULL
        AND ds.checked_in = true
    ),
    credit_deficit AS (
      SELECT
        sc.id AS credit_id,
        sc.units_total,
        sc.units_consumed,
        COUNT(sf.session_id) - sc.units_consumed AS deficit
      FROM service_credits sc
      JOIN session_flags sf ON sf.credit_id = sc.id
      WHERE sc.service_code IN ('daycare_full_day', 'daycare_hourly')
      GROUP BY sc.id, sc.units_total, sc.units_consumed
      HAVING COUNT(sf.session_id) > sc.units_consumed
    ),
    ranked AS (
      SELECT
        sf.session_id,
        sf.credit_id,
        cd.deficit,
        ROW_NUMBER() OVER (
          PARTITION BY sf.credit_id
          ORDER BY sf.created_at DESC
        ) AS pick_rank
      FROM session_flags sf
      JOIN credit_deficit cd ON cd.credit_id = sf.credit_id
      WHERE NOT sf.has_direct_invoice
        AND NOT sf.has_batch_covered_invoice
    )
    SELECT session_id, credit_id
    FROM ranked
    WHERE pick_rank <= deficit
    ORDER BY credit_id, pick_rank
  LOOP
    SELECT (sc.units_total - sc.units_consumed)
    INTO v_remaining
    FROM service_credits sc
    WHERE sc.id = r.credit_id;

    IF v_remaining IS NULL OR v_remaining < 1 THEN
      RAISE NOTICE 'Skip session % — credit % has no remaining units',
        r.session_id, r.credit_id;
      CONTINUE;
    END IF;

    PERFORM *
    FROM public.consume_service_credit(
      r.credit_id,
      1,
      r.session_id,
      'daycare_session'
    );

    RAISE NOTICE 'Consumed 1 unit on credit % for session %',
      r.credit_id, r.session_id;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFY — no package should still have session count > units_consumed
-- (for active daycare credits with checked-in sessions)
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT
  sc.id AS credit_id,
  p.name AS pet_name,
  o.last_name,
  sc.units_total,
  sc.units_consumed,
  COUNT(ds.id) FILTER (WHERE ds.checked_in) AS checked_in_sessions,
  COUNT(ds.id) FILTER (WHERE ds.checked_in) - sc.units_consumed AS remaining_deficit
FROM service_credits sc
JOIN pets p ON p.id = sc.pet_id
JOIN owners o ON o.id = p.owner_id
LEFT JOIN daycare_sessions ds ON ds.package_id = sc.id
WHERE sc.service_code IN ('daycare_full_day', 'daycare_hourly')
GROUP BY sc.id, p.name, o.last_name, sc.units_total, sc.units_consumed
HAVING COUNT(ds.id) FILTER (WHERE ds.checked_in) > sc.units_consumed
ORDER BY remaining_deficit DESC;

-- Expect 0 rows. Re-run PREVIEW — also expect 0 rows.
