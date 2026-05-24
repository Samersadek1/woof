-- Cat boarding (cattery wing) is no longer used in Woof — deactivate those rooms.
UPDATE public.rooms
SET is_active = false
WHERE wing::text = 'cattery';
