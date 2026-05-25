-- Same as supabase/migrations/20260525230000_peak_periods_pricelist.sql
-- Run as one transaction in Supabase SQL editor if not applied via CLI.

BEGIN;

UPDATE peak_periods SET is_active = false WHERE is_active;

INSERT INTO peak_periods (label, start_month, start_day, end_month, end_day, notes) VALUES
  ('May Peak',              5, 19,  5, 29, 'Annual: May 19–29'),
  ('June Peak',             6, 15,  6, 16, 'Annual: June 15–16'),
  ('Summer Peak',           7,  1,  8, 31, 'Annual: July 1–August 31 (includes Aug 25–26)'),
  ('Late November Peak',   11, 30, 12,  2, 'Annual: November 30–December 2'),
  ('Christmas/NY Peak',    12, 20,  1,  8, 'Annual: December 20–January 8');

SELECT label, start_month, start_day, end_month, end_day
FROM peak_periods WHERE is_active ORDER BY start_month, start_day;

SELECT
  is_peak_date('2026-05-19') AS may19_peak,
  is_peak_date('2026-08-31') AS aug31_peak,
  is_peak_date('2026-09-01') AS sep01_off,
  is_peak_date('2026-12-03') AS dec03_off,
  is_peak_date('2027-01-09') AS jan09_off;

COMMIT;
