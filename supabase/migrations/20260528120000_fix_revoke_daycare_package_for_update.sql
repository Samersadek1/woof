-- Fix: FOR UPDATE with LEFT JOIN errors with
-- "UPDATE cannot be applied to the nullable side of an outer join".
-- Lock service_credits alone; fetch invoice_id in a separate query.

CREATE OR REPLACE FUNCTION public.revoke_daycare_package_credit(
  p_credit_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(credit_id uuid, invoice_voided boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credit record;
  v_session_count int;
  v_active_sibling_count int;
  v_invoice_id uuid;
  v_invoice_voided boolean := false;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'revoke_daycare_package_credit requires authenticated user';
  END IF;

  SELECT *
  INTO v_credit
  FROM service_credits
  WHERE id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package credit % not found', p_credit_id;
  END IF;

  IF v_credit.service_code NOT IN ('daycare_full_day', 'daycare_hourly') THEN
    RAISE EXCEPTION 'Only daycare package credits can be revoked with this function';
  END IF;

  IF v_credit.status = 'revoked' THEN
    RETURN QUERY SELECT p_credit_id, false;
    RETURN;
  END IF;

  IF coalesce(v_credit.units_consumed, 0) > 0 THEN
    RAISE EXCEPTION 'Cannot remove package — % day(s) already used. Cancel check-ins first if needed.',
      v_credit.units_consumed;
  END IF;

  SELECT count(*) INTO v_session_count
  FROM daycare_sessions ds
  WHERE ds.package_id = p_credit_id;

  IF v_session_count > 0 THEN
    RAISE EXCEPTION 'Cannot remove package — % planner/check-in session(s) still linked. Delete those sessions first.',
      v_session_count;
  END IF;

  UPDATE service_credits
  SET status = 'revoked'
  WHERE id = p_credit_id;

  v_invoice_id := NULL;
  IF v_credit.purchase_group_id IS NOT NULL THEN
    SELECT pg.invoice_id INTO v_invoice_id
    FROM purchase_groups pg
    WHERE pg.id = v_credit.purchase_group_id;
  END IF;

  IF v_invoice_id IS NOT NULL AND v_credit.purchase_group_id IS NOT NULL THEN
    SELECT count(*) INTO v_active_sibling_count
    FROM service_credits sc
    WHERE sc.purchase_group_id = v_credit.purchase_group_id
      AND sc.id <> p_credit_id
      AND sc.status = 'active';

    IF v_active_sibling_count = 0 THEN
      UPDATE invoices
      SET status = 'voided',
          voided_at = now(),
          voided_reason = coalesce(nullif(trim(p_reason), ''), 'Daycare package removed by staff'),
          notes = coalesce(notes, '') || ' [Package revoked]'
      WHERE id = v_invoice_id
        AND status NOT IN ('voided', 'cancelled', 'paid');

      v_invoice_voided := FOUND;
    END IF;
  END IF;

  RETURN QUERY SELECT p_credit_id, v_invoice_voided;
END
$function$;

-- Verification
SELECT proname,
       strpos(pg_get_functiondef(oid), 'LEFT JOIN purchase_groups') = 0 AS no_outer_join_lock
FROM pg_proc
WHERE proname = 'revoke_daycare_package_credit';
