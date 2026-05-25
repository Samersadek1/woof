-- Run the migration in Supabase SQL editor:
--   supabase/migrations/20260525220000_dashboard_boarding_occupancy_align.sql
--
-- Verification (paste after applying):

SELECT public.boarding_kennel_occupancy_counts(CURRENT_DATE);

SELECT public.get_dashboard_metrics(CURRENT_DATE) -> 'occupancy' AS occupancy;
