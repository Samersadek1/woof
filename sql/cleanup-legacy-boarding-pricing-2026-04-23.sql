-- =============================================================================
-- Legacy pricing cleanup (reversible, non-destructive)
-- Date: 2026-04-23
--
-- Goal
-- - Reduce operator confusion by clearly marking old `boarding_*` pricing rows
--   as legacy while preserving data and rollback ability.
--
-- Strategy
-- 1) Snapshot legacy rows into `pricing_legacy_archive` (idempotent upsert).
-- 2) Mark live rows by prefixing labels with [LEGACY].
-- 3) Keep rows in place (no DELETE) to avoid breaking unknown consumers.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pricing_legacy_archive (
  key            TEXT PRIMARY KEY,
  amount_aed     NUMERIC NOT NULL,
  label          TEXT NOT NULL,
  category       TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NULL,
  archived_reason TEXT NOT NULL,
  archived_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH legacy_keys AS (
  SELECT unnest(ARRAY[
    'boarding_double_royal',
    'boarding_family_room',
    'boarding_presidential_suite_multi',
    'boarding_presidential_suite_single',
    'boarding_presidential_suite_twin',
    'boarding_royal_annex',
    'boarding_royal_suite_double',
    'boarding_royal_suite_single',
    'boarding_single_royal'
  ]) AS key
)
INSERT INTO public.pricing_legacy_archive (
  key,
  amount_aed,
  label,
  category,
  updated_at,
  archived_reason,
  archived_at
)
SELECT
  p.key,
  p.amount_aed,
  p.label,
  p.category,
  p.updated_at,
  'Legacy boarding key no longer used by current room pricing resolver',
  NOW()
FROM public.pricing p
JOIN legacy_keys lk ON lk.key = p.key
ON CONFLICT (key) DO UPDATE
SET
  amount_aed = EXCLUDED.amount_aed,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  updated_at = EXCLUDED.updated_at,
  archived_reason = EXCLUDED.archived_reason,
  archived_at = NOW();

WITH legacy_keys AS (
  SELECT unnest(ARRAY[
    'boarding_double_royal',
    'boarding_family_room',
    'boarding_presidential_suite_multi',
    'boarding_presidential_suite_single',
    'boarding_presidential_suite_twin',
    'boarding_royal_annex',
    'boarding_royal_suite_double',
    'boarding_royal_suite_single',
    'boarding_single_royal'
  ]) AS key
)
UPDATE public.pricing p
SET
  label = CASE
    WHEN p.label LIKE '[LEGACY] %' THEN p.label
    ELSE '[LEGACY] ' || p.label
  END,
  updated_at = NOW()
FROM legacy_keys lk
WHERE p.key = lk.key;

COMMIT;

-- =============================================================================
-- Verification
-- =============================================================================
-- SELECT key, category, amount_aed, label
-- FROM public.pricing
-- WHERE key LIKE 'boarding_%'
-- ORDER BY key;
--
-- SELECT key, category, amount_aed, label, archived_at
-- FROM public.pricing_legacy_archive
-- ORDER BY key;

-- =============================================================================
-- Rollback (manual)
-- =============================================================================
-- BEGIN;
-- UPDATE public.pricing p
-- SET
--   amount_aed = a.amount_aed,
--   label = a.label,
--   category = a.category,
--   updated_at = NOW()
-- FROM public.pricing_legacy_archive a
-- WHERE p.key = a.key;
-- COMMIT;
