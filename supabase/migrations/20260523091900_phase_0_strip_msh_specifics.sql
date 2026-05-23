BEGIN;

DROP TRIGGER IF EXISTS trg_auto_invoice_registration ON pets;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE',
      n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS cmd
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'tier_discount_pct','apply_member_discount','auto_invoice_registration_on_pass',
      'is_off_peak','resolve_boarding_line_price','resolve_boarding_pricing_key',
      'resolve_line_price','resolve_grooming_price','agent_quote_boarding_price'
    )
  LOOP EXECUTE r.cmd; END LOOP;
END $$;

DROP TABLE IF EXISTS park_bookings           CASCADE;
DROP TABLE IF EXISTS park_day_flags          CASCADE;
DROP TABLE IF EXISTS park_rates              CASCADE;
DROP TABLE IF EXISTS pricing_legacy_archive  CASCADE;

ALTER TABLE owners DROP COLUMN IF EXISTS member_type;
ALTER TABLE owners DROP COLUMN IF EXISTS membership_date;
ALTER TABLE owners DROP COLUMN IF EXISTS membership_fee_paid;
ALTER TABLE rooms  DROP COLUMN IF EXISTS pricing_category;
ALTER TABLE rooms  DROP COLUMN IF EXISTS pricing_size_tier;
ALTER TABLE pets   DROP COLUMN IF EXISTS registration_invoiced;

DROP TYPE IF EXISTS member_type;
DROP TYPE IF EXISTS park_day_status;
DROP TYPE IF EXISTS park_size;

DO $$
DECLARE
  surviving_tables TEXT; surviving_cols TEXT;
  surviving_enums  TEXT; surviving_funcs TEXT;
BEGIN
  SELECT string_agg(table_name, ', ') INTO surviving_tables
  FROM information_schema.tables WHERE table_schema='public'
    AND table_name IN ('park_bookings','park_day_flags','park_rates','pricing_legacy_archive');

  SELECT string_agg(table_name||'.'||column_name, ', ') INTO surviving_cols
  FROM information_schema.columns WHERE table_schema='public'
    AND (
      (table_name='owners' AND column_name IN ('member_type','membership_date','membership_fee_paid'))
      OR (table_name='rooms' AND column_name IN ('pricing_category','pricing_size_tier'))
      OR (table_name='pets'  AND column_name='registration_invoiced')
    );

  SELECT string_agg(typname, ', ') INTO surviving_enums
  FROM pg_type WHERE typname IN ('member_type','park_day_status','park_size')
    AND typnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public');

  SELECT string_agg(proname, ', ') INTO surviving_funcs
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'tier_discount_pct','apply_member_discount','auto_invoice_registration_on_pass',
    'is_off_peak','resolve_boarding_line_price','resolve_boarding_pricing_key',
    'resolve_line_price','resolve_grooming_price','agent_quote_boarding_price'
  );

  IF surviving_tables IS NOT NULL THEN RAISE EXCEPTION 'Tables not dropped: %', surviving_tables; END IF;
  IF surviving_cols   IS NOT NULL THEN RAISE EXCEPTION 'Columns not dropped: %', surviving_cols; END IF;
  IF surviving_enums  IS NOT NULL THEN RAISE EXCEPTION 'Enums not dropped: %', surviving_enums; END IF;
  IF surviving_funcs  IS NOT NULL THEN RAISE EXCEPTION 'Functions not dropped: %', surviving_funcs; END IF;
END $$;

COMMIT;
