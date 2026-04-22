-- Align member discount policy with 2026 pricing rules:
--   silver = 10%
--   gold   = 20%
--   others = 0%
CREATE OR REPLACE FUNCTION apply_member_discount(
  p_owner_id UUID,
  p_subtotal NUMERIC
)
RETURNS TABLE (
  discount_pct NUMERIC,
  discount_aed NUMERIC,
  final_aed NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_type TEXT;
  v_pct NUMERIC := 0;
BEGIN
  SELECT member_type::TEXT INTO v_member_type
  FROM owners
  WHERE id = p_owner_id;

  CASE v_member_type
    WHEN 'gold' THEN v_pct := 20;
    WHEN 'silver' THEN v_pct := 10;
    ELSE v_pct := 0;
  END CASE;

  RETURN QUERY
  SELECT
    v_pct,
    ROUND(p_subtotal * v_pct / 100.0, 2),
    ROUND(p_subtotal * (1.0 - v_pct / 100.0), 2);
END;
$$;
