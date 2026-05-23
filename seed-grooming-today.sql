-- =============================================================================
-- seed-grooming-today.sql  (rev: time-typed VALUES — no to_char, no text for time)
-- Paste the ENTIRE file. If the error still mentions to_char, your editor has an
-- old script; this file’s SELECT uses only `s.tm` (never to_char).
-- =============================================================================
--
-- Inserts only: appointment_date, appointment_time, owner_id, pet_id,
--               service, status, notes
-- appointment_time: each slot uses 'HH:MM:SS'::time; SELECT casts (s.tm)::time for the column.
--   Matches app: Grooming.tsx timeToDb() → "HH:mm:ss" for Supabase insert.
-- PostgreSQL VALUES ... AS v(col1, col2) allows only names, not col types (no "off int").
-- Duration, price, groomer are in the notes text for demo purposes.
-- grooming_service in DB (woof): full_groom, full_bath, nail_clip,
-- deshedding, brushing, pawdicure — no ear_cleaning / teeth_brushing.
-- Re-check: SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
--   WHERE t.typname = 'grooming_service' ORDER BY enumsortorder;
-- =============================================================================

DELETE FROM grooming_appointments
WHERE notes LIKE '%__demo_groom_today__%';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pets LIMIT 1) THEN
    RAISE EXCEPTION 'No pets in database. Run seed.sql or add pets first.';
  END IF;
END $$;

WITH dubai_today AS (
  SELECT ((now() AT TIME ZONE 'Asia/Dubai'))::date AS d
),
pet_list AS (
  SELECT
    id AS pet_id,
    owner_id,
    row_number() OVER (ORDER BY created_at DESC NULLS LAST, id) AS ix
  FROM pets
),
n_pets AS (
  SELECT GREATEST(COUNT(*)::int, 1) AS n FROM pet_list
),
slots AS (
  SELECT *
  FROM (
    VALUES
      (0, '09:00:00'::time, 'full_groom',   'scheduled',    '__demo_groom_today__ 09:00 full groom · Maria G. · 90min · AED 280'),
      (1, '09:45:00'::time, 'nail_clip',    'scheduled',    '__demo_groom_today__ 09:45 nails · Alex P. · 25min · AED 55'),
      (2, '10:30:00'::time, 'full_bath',    'in_progress', '__demo_groom_today__ 10:30 bath · Maria G. · 50min · AED 150'),
      (3, '11:15:00'::time, 'deshedding',   'scheduled',    '__demo_groom_today__ 11:15 deshed · Sam K. · 75min · AED 220'),
      (4, '13:00:00'::time, 'brushing',     'scheduled',    '__demo_groom_today__ 13:00 brush · Alex P. · 30min · AED 80'),
      (5, '14:00:00'::time, 'full_groom',   'scheduled',    '__demo_groom_today__ 14:00 full groom · Maria G. · 90min · AED 280'),
      (6, '15:30:00'::time, 'pawdicure',    'completed',    '__demo_groom_today__ 15:30 pawdicure (done) · Sam K. · 40min · AED 95'),
      (7, '16:15:00'::time, 'nail_clip',    'scheduled',    '__demo_groom_today__ 16:15 nails · Alex P. · 20min · AED 45')
  ) AS v(off, tm, svc, st, nt)
)
INSERT INTO grooming_appointments (
  appointment_date,
  appointment_time,
  owner_id,
  pet_id,
  service,
  status,
  notes
)
SELECT
  dt.d,
  (s.tm)::time,
  pl.owner_id,
  pl.pet_id,
  s.svc::grooming_service,
  s.st,
  s.nt
FROM dubai_today dt
CROSS JOIN slots s
CROSS JOIN n_pets np
JOIN pet_list pl
  ON pl.ix = (MOD(s.off, np.n) + 1);
