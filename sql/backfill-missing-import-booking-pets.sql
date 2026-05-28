-- Backfill booking_pets for legacy imports where notes list multiple pets (src: A/B/C)
-- but only one pet was linked. Matches owner pets by name against the src segment.
--
-- Idempotent: ON CONFLICT (booking_id, pet_id) DO NOTHING.
-- Samer runs SQL in Supabase SQL editor.

BEGIN;

WITH booking_src AS (
  SELECT
    b.id AS booking_id,
    b.owner_id,
    lower(trim(regexp_replace(regexp_replace(b.notes, '^.*src:\s*', ''), '\s*\|.*$', ''))) AS src_segment
  FROM public.bookings b
  WHERE b.booking_type = 'boarding'::public.booking_type
    AND b.notes ~ 'src:\s*[^|]+/'
),
name_parts AS (
  SELECT
    bs.booking_id,
    bs.owner_id,
    trim(part) AS raw_name
  FROM booking_src bs
  CROSS JOIN LATERAL regexp_split_to_table(bs.src_segment, '\s*/\s*') AS part
  WHERE trim(part) <> ''
),
by_split AS (
  SELECT DISTINCT bs.booking_id, p.id AS pet_id
  FROM name_parts np
  JOIN booking_src bs ON bs.booking_id = np.booking_id
  JOIN public.pets p ON p.owner_id = np.owner_id
  WHERE lower(trim(p.name)) = lower(np.raw_name)
     OR lower(trim(p.name)) = lower(regexp_replace(np.raw_name, '\s+[A-Za-z]$', ''))
),
by_substring AS (
  SELECT DISTINCT bs.booking_id, p.id AS pet_id
  FROM booking_src bs
  JOIN public.pets p ON p.owner_id = bs.owner_id
  WHERE length(trim(p.name)) >= 2
    AND bs.src_segment LIKE '%' || lower(trim(p.name)) || '%'
),
candidates AS (
  SELECT booking_id, pet_id FROM by_split
  UNION
  SELECT booking_id, pet_id FROM by_substring
),
inserted AS (
  INSERT INTO public.booking_pets (booking_id, pet_id)
  SELECT c.booking_id, c.pet_id
  FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.booking_pets bp
    WHERE bp.booking_id = c.booking_id
      AND bp.pet_id = c.pet_id
  )
  ON CONFLICT (booking_id, pet_id) DO NOTHING
  RETURNING booking_id, pet_id
)
SELECT COUNT(*) AS booking_pets_inserted FROM inserted;

COMMIT;

-- Re-apply double-occupancy discount on affected boarding invoices (optional, run after COMMIT):
-- SELECT public.apply_double_occupancy_discount(b.id)
-- FROM public.bookings b
-- WHERE b.booking_type = 'boarding'
--   AND b.notes ~ 'src:\s*[^|]+/'
--   AND (SELECT COUNT(*) FROM public.booking_pets bp WHERE bp.booking_id = b.id) >= 2;

-- Verification:
-- SELECT b.booking_ref, b.notes, array_agg(p.name ORDER BY p.name) AS pets
-- FROM public.bookings b
-- JOIN public.booking_pets bp ON bp.booking_id = b.id
-- JOIN public.pets p ON p.id = bp.pet_id
-- WHERE b.notes ~ 'src:\s*[^|]+/'
-- GROUP BY b.id
-- HAVING COUNT(bp.pet_id) = 1
-- ORDER BY b.booking_ref
-- LIMIT 20;
