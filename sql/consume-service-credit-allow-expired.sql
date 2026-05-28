-- Allow daycare check-in to consume expired package credits when staff opts in.
-- Samer: run in Supabase SQL Editor, then regenerate types if needed.

CREATE OR REPLACE FUNCTION consume_service_credit(
  p_credit_id uuid,
  p_units int DEFAULT 1,
  p_consumed_for_ref_id uuid DEFAULT NULL,
  p_consumed_for_ref_type text DEFAULT NULL,
  p_allow_expired boolean DEFAULT false
)
RETURNS TABLE (
  credit_id uuid,
  units_remaining int,
  new_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit service_credits%ROWTYPE;
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

  IF v_credit.status NOT IN ('active', 'expired') THEN
    RAISE EXCEPTION 'Credit not active';
  END IF;

  IF v_credit.expires_at < CURRENT_DATE AND NOT COALESCE(p_allow_expired, false) THEN
    UPDATE service_credits
    SET status = 'expired'
    WHERE id = p_credit_id;
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
  SELECT p_credit_id, (v_credit.units_total - v_new_consumed)::int, v_new_status;
END;
$$;

-- Verification
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'consume_service_credit';
