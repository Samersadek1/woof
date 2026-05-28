-- Include household shared daycare package credits for every pet on the purchase
-- (credit may be anchored on one pet_id for schema reasons).

CREATE OR REPLACE FUNCTION public.list_active_credits_for_pet(
  p_pet_id uuid,
  p_service_code service_code DEFAULT NULL
)
RETURNS TABLE (
  credit_id uuid,
  service_code service_code,
  units_remaining int,
  expires_at date,
  is_bonus boolean,
  source_type text,
  package_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  SELECT
    sc.id AS credit_id,
    sc.service_code,
    (sc.units_total - sc.units_consumed)::int AS units_remaining,
    sc.expires_at,
    sc.is_bonus,
    sc.source_type,
    pd.display_name AS package_name
  FROM service_credits sc
  LEFT JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
  LEFT JOIN package_definitions pd ON pd.id = pg.package_def_id
  WHERE sc.status = 'active'
    AND sc.expires_at >= CURRENT_DATE
    AND (p_service_code IS NULL OR sc.service_code = p_service_code)
    AND (
      sc.pet_id = p_pet_id
      OR (
        COALESCE(pg.pet_count, 1) >= 2
        AND EXISTS (
          SELECT 1
          FROM pets anchor_pet
          JOIN pets target_pet ON target_pet.owner_id = anchor_pet.owner_id
          WHERE anchor_pet.id = sc.pet_id
            AND target_pet.id = p_pet_id
        )
      )
    )
  ORDER BY sc.expires_at ASC, sc.is_bonus DESC;
$$;

-- Verification
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_active_credits_for_pet';
