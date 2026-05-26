-- Restore package credits when undoing a daycare check-in (companion to consume_service_credit).
BEGIN;

CREATE OR REPLACE FUNCTION public.restore_service_credit(
  p_credit_id uuid,
  p_units integer DEFAULT 1
)
RETURNS TABLE(
  credit_id uuid,
  units_remaining integer,
  new_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_credit record;
  v_new_consumed int;
  v_new_status text;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'restore_service_credit requires authenticated user';
  END IF;

  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'p_units must be > 0';
  END IF;

  SELECT *
  INTO v_credit
  FROM public.service_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit % not found', p_credit_id;
  END IF;

  IF p_units > v_credit.units_consumed THEN
    RAISE EXCEPTION 'Cannot restore % units; only % consumed', p_units, v_credit.units_consumed;
  END IF;

  v_new_consumed := v_credit.units_consumed - p_units;
  v_new_status := CASE
    WHEN v_new_consumed >= v_credit.units_total THEN 'depleted'
    WHEN v_credit.expires_at < CURRENT_DATE THEN 'expired'
    ELSE 'active'
  END;

  UPDATE public.service_credits
  SET units_consumed = v_new_consumed,
      status = v_new_status
  WHERE id = p_credit_id;

  RETURN QUERY
  SELECT p_credit_id, (v_credit.units_total - v_new_consumed), v_new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_service_credit(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_service_credit(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_service_credit(uuid, integer) TO service_role;

COMMIT;

-- Verification:
-- SELECT proname FROM pg_proc WHERE proname = 'restore_service_credit';
