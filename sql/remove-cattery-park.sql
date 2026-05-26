-- Retire cattery (cat boarding) and dog-park visitation from woof.
-- Paste into Supabase SQL editor. Same as supabase/migrations/20260526120000_remove_cattery_park.sql
-- Does NOT remove park_lane room wing (dog kennel "Park Lane" suites).

UPDATE public.rooms
SET is_active = false,
    updated_at = NOW()
WHERE wing::text = 'cattery';

UPDATE public.service_code_meta
SET is_active = false,
    updated_at = NOW()
WHERE service_code::text LIKE 'park%';

UPDATE public.service_rates sr
SET is_active = false,
    updated_at = NOW()
FROM public.service_code_meta scm
WHERE sr.service_code = scm.service_code
  AND scm.service_code::text LIKE 'park%';

-- Then run the get_dashboard_metrics CREATE OR REPLACE from the migration file.

-- Verification:
-- SELECT COUNT(*) AS active_cattery_rooms FROM rooms WHERE wing::text = 'cattery' AND is_active;
-- SELECT public.get_dashboard_metrics(CURRENT_DATE) -> 'occupancy' AS occupancy;
