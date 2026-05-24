-- Deactivate legacy F100 / D100 rows (excluded from boarding calendars and room pickers).
UPDATE public.rooms
SET is_active = false
WHERE UPPER(TRIM(room_number)) IN ('F100', 'D100')
   OR UPPER(REPLACE(TRIM(display_name), ' ', '')) IN ('F100', 'D100');
