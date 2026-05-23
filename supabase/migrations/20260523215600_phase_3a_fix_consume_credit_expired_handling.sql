BEGIN;

CREATE OR REPLACE FUNCTION public.consume_service_credit(
  p_credit_id uuid,
  p_units integer DEFAULT 1,
  p_consumed_for_ref_id uuid DEFAULT NULL::uuid,
  p_consumed_for_ref_type text DEFAULT NULL::text
)
RETURNS TABLE(
  credit_id uuid,
  units_remaining integer,
  new_status text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credit record;
  v_new_consumed int;
  v_new_status text;
BEGIN
  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'p_units must be > 0';
  END IF;

  SELECT *
  INTO v_credit
  FROM service_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit % not found', p_credit_id;
  END IF;

  IF v_credit.status <> 'active' THEN
    RAISE EXCEPTION 'Credit not active';
  END IF;

  -- We do NOT update status='expired' here because RAISE EXCEPTION
  -- rolls back the whole function call. list_active_credits_for_pet
  -- already filters by expires_at, so the denormalized status is
  -- nice-to-have. A separate mark_expired_credits() job can be added
  -- later for reporting hygiene.
  IF v_credit.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Credit expired on %', v_credit.expires_at;
  END IF;

  IF p_units > (v_credit.units_total - v_credit.units_consumed) THEN
    RAISE EXCEPTION 'Insufficient units (% available, % requested)',
      (v_credit.units_total - v_credit.units_consumed), p_units;
  END IF;

  v_new_consumed := v_credit.units_consumed + p_units;
  v_new_status := CASE
    WHEN v_new_consumed >= v_credit.units_total THEN 'depleted'
    ELSE 'active'
  END;

  UPDATE service_credits
  SET units_consumed = v_new_consumed,
      status = v_new_status
  WHERE id = p_credit_id;

  IF v_credit.redemption_group_id IS NOT NULL AND v_credit.is_bonus THEN
    UPDATE service_credits
    SET status = 'revoked'
    WHERE redemption_group_id = v_credit.redemption_group_id
      AND id <> p_credit_id
      AND status = 'active';
  END IF;

  RETURN QUERY
  SELECT p_credit_id, (v_credit.units_total - v_new_consumed), v_new_status;
END
$function$;

COMMIT;
