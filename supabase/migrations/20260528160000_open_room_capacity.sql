-- Open kennel room capacity: stop treating rooms as single/double occupancy slots.
-- Staff can assign multiple pets per room for now (max_pets raised; capacity_type = multiple).

BEGIN;

UPDATE public.rooms
SET
  capacity_type = 'multiple'::public.capacity_type,
  max_pets = GREATEST(COALESCE(max_pets, 1), 99)
WHERE is_active = TRUE;

COMMIT;

-- Verification (paste in SQL editor):
-- SELECT capacity_type, max_pets, COUNT(*) FROM public.rooms WHERE is_active GROUP BY 1, 2 ORDER BY 2, 1;
