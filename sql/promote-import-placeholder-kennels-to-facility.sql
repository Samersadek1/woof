-- Imported kennel rooms (A1, B1, Dcare2a1, …) were stored on import_placeholder wing
-- but are real assignable kennels. Promote them to back_kennels for admin/wing metadata.
-- Synthetic UNK-* / tier-estimate rows stay on import_placeholder.

UPDATE public.rooms
SET wing = 'back_kennels'::public.room_wing
WHERE wing = 'import_placeholder'::public.room_wing
  AND is_active
  AND room_number NOT LIKE 'UNK-%'
  AND COALESCE(notes, '') NOT ILIKE '%import_placeholder_tier=%'
  AND display_name NOT ILIKE 'Unknown ·%'
  AND display_name NOT ILIKE 'Unknown -%';

-- Align overlap trigger helper with app logic (wing alone is not enough).
CREATE OR REPLACE FUNCTION public.is_import_placeholder_room_id(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = p_room_id
      AND (
        r.room_number LIKE 'UNK-%'
        OR COALESCE(r.notes, '') ILIKE '%import_placeholder_tier=%'
        OR r.display_name ILIKE 'Unknown ·%'
        OR r.display_name ILIKE 'Unknown -%'
      )
  );
$function$;
