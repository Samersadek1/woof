DO $$
BEGIN
  ALTER TABLE public.billing_adjustments
    DROP CONSTRAINT IF EXISTS billing_adjustments_adjustment_type_check;

  ALTER TABLE public.billing_adjustments
    ADD CONSTRAINT billing_adjustments_adjustment_type_check
    CHECK (
      adjustment_type = ANY (
        ARRAY[
          'price_override'::text,
          'refund_override'::text,
          'discount_override'::text,
          'fee_waived'::text,
          'goodwill_credit'::text,
          'cancellation_refund'::text,
          'double_occupancy_discount'::text
        ]
      )
    );
END
$$;
