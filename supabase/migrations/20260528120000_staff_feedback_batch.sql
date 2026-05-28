-- Staff feedback batch: payment_link enum, consolidate invoices, package backdate, pet-photos bucket

DO $$ BEGIN
  ALTER TYPE payment_method ADD VALUE 'payment_link';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE transaction_type ADD VALUE 'payment_link_payment';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit log for invoice consolidation
CREATE TABLE IF NOT EXISTS public.invoice_consolidation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id),
  consolidated_invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  source_invoice_ids uuid[] NOT NULL,
  performed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_consolidation_log_owner
  ON public.invoice_consolidation_log (owner_id, created_at DESC);

-- pet-photos storage bucket (passports, profile photos, vaccicheck)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pet-photos', 'pet-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$ BEGIN
  CREATE POLICY pet_photos_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'pet-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY pet_photos_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'pet-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY pet_photos_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'pet-photos')
    WITH CHECK (bucket_id = 'pet-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY pet_photos_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'pet-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Consolidate selected open invoices for one owner into a new finalised invoice
CREATE OR REPLACE FUNCTION public.consolidate_owner_invoices(
  p_owner_id uuid,
  p_invoice_ids uuid[],
  p_performed_by text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_invoice_id uuid;
  v_new_invoice_number text;
  v_src record;
  v_line record;
  v_adj record;
  v_total_paid numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_total_aed numeric := 0;
  v_vat_aed numeric := 0;
  v_new_status invoice_status;
  v_open_statuses invoice_status[] := ARRAY[
    'draft'::invoice_status,
    'finalised'::invoice_status,
    'issued'::invoice_status,
    'outstanding'::invoice_status,
    'overdue'::invoice_status,
    'partially_paid'::invoice_status
  ];
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'consolidate_owner_invoices requires authenticated user';
  END IF;

  IF p_invoice_ids IS NULL OR array_length(p_invoice_ids, 1) IS NULL OR array_length(p_invoice_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Select at least two invoices to consolidate';
  END IF;

  IF nullif(trim(p_performed_by), '') IS NULL THEN
    RAISE EXCEPTION 'p_performed_by is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
      AND (i.owner_id <> p_owner_id OR i.status = ANY (ARRAY['voided'::invoice_status, 'cancelled'::invoice_status, 'paid'::invoice_status]))
  ) THEN
    RAISE EXCEPTION 'All selected invoices must belong to the owner and be open (not paid/voided/cancelled)';
  END IF;

  IF (
    SELECT count(DISTINCT i.id)
    FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
      AND i.owner_id = p_owner_id
      AND i.status = ANY (v_open_statuses)
  ) <> array_length(p_invoice_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected invoices were not found or are not eligible';
  END IF;

  INSERT INTO invoices (
    owner_id, issue_date, status, subtotal, subtotal_aed, discount_amount, discount_aed,
    total, total_aed, vat_aed, amount_paid, service_type, notes
  ) VALUES (
    p_owner_id,
    CURRENT_DATE,
    'finalised'::invoice_status,
    0, 0, 0, 0, 0, 0, 0, 0,
    'consolidated',
    'Consolidated invoice created by ' || trim(p_performed_by)
  )
  RETURNING id INTO v_new_invoice_id;

  FOR v_src IN
    SELECT i.*
    FROM invoices i
    WHERE i.id = ANY (p_invoice_ids)
    ORDER BY i.created_at
  LOOP
    v_total_paid := v_total_paid + coalesce(v_src.amount_paid, 0);
    v_subtotal := v_subtotal + coalesce(v_src.subtotal_aed, v_src.subtotal, 0);
    v_discount := v_discount + coalesce(v_src.discount_aed, v_src.discount_amount, 0);
    v_total := v_total + coalesce(v_src.total_aed, v_src.total, 0);
    v_vat_aed := v_vat_aed + coalesce(v_src.vat_aed, 0);

    FOR v_line IN
      SELECT * FROM invoice_line_items WHERE invoice_id = v_src.id ORDER BY sort_order NULLS LAST, created_at
    LOOP
      INSERT INTO invoice_line_items (
        invoice_id, description, quantity, unit_price, total_price, line_total, service_type, pricing_key, sort_order
      ) VALUES (
        v_new_invoice_id,
        coalesce(v_src.invoice_number, left(v_src.id::text, 8)) || ': ' || v_line.description,
        v_line.quantity,
        v_line.unit_price,
        v_line.total_price,
        coalesce(v_line.line_total, v_line.total_price),
        v_line.service_type,
        v_line.pricing_key,
        v_line.sort_order
      );
    END LOOP;

    FOR v_adj IN
      SELECT * FROM billing_adjustments WHERE invoice_id = v_src.id
    LOOP
      INSERT INTO billing_adjustments (
        owner_id, invoice_id, adjustment_type, original_amount, adjusted_amount, reason, approved_by
      ) VALUES (
        p_owner_id,
        v_new_invoice_id,
        v_adj.adjustment_type,
        v_adj.original_amount,
        v_adj.adjusted_amount,
        coalesce(v_adj.reason, '') || ' (from ' || coalesce(v_src.invoice_number, left(v_src.id::text, 8)) || ')',
        coalesce(v_adj.approved_by, trim(p_performed_by))
      );
    END LOOP;

    UPDATE invoices
    SET status = 'voided',
        voided_at = now(),
        voided_reason = 'Consolidated into invoice ' || v_new_invoice_id::text
    WHERE id = v_src.id;
  END LOOP;

  IF v_total_paid >= v_total AND v_total > 0 THEN
    v_new_status := 'paid'::invoice_status;
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partially_paid'::invoice_status;
  ELSE
    v_new_status := 'finalised'::invoice_status;
  END IF;

  UPDATE invoices
  SET subtotal = v_subtotal,
      subtotal_aed = v_subtotal,
      discount_amount = v_discount,
      discount_aed = v_discount,
      total = v_total,
      total_aed = v_total,
      vat_aed = v_vat_aed,
      amount_paid = v_total_paid,
      status = v_new_status,
      paid_at = CASE WHEN v_new_status = 'paid'::invoice_status THEN now() ELSE NULL END
  WHERE id = v_new_invoice_id;

  INSERT INTO invoice_consolidation_log (owner_id, consolidated_invoice_id, source_invoice_ids, performed_by)
  VALUES (p_owner_id, v_new_invoice_id, p_invoice_ids, trim(p_performed_by));

  RETURN v_new_invoice_id;
END
$function$;

REVOKE ALL ON FUNCTION public.consolidate_owner_invoices(uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consolidate_owner_invoices(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consolidate_owner_invoices(uuid, uuid[], text) TO service_role;

-- purchase_package with optional backdate
CREATE OR REPLACE FUNCTION public.purchase_package(
  p_owner_id uuid,
  p_package_code text,
  p_pet_ids uuid[],
  p_payment_method payment_method DEFAULT 'card'::payment_method,
  p_issue_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  invoice_id uuid,
  purchase_group_id uuid,
  total_amount_aed numeric,
  discount_applied_aed numeric,
  credits_granted integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_package_def_id uuid;
  v_validity_months int;
  v_multi_pet_discount_pct numeric;
  v_invoice_id uuid;
  v_purchase_group_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_pet_id uuid;
  v_pet_size pet_size;
  v_pet_coat coat_type;
  v_pet_name text;
  v_pet_amount numeric;
  v_grant record;
  v_grant_redemption_group_id uuid;
  v_credits_count int := 0;
  v_pet_count int;
  v_distinct_pet_count int;
  v_display_name text;
  v_redemption_groups jsonb := '{}'::jsonb;
  v_issue date := coalesce(p_issue_date, CURRENT_DATE);
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'purchase_package requires authenticated user';
  END IF;

  IF v_issue > CURRENT_DATE THEN
    RAISE EXCEPTION 'p_issue_date cannot be in the future';
  END IF;

  IF array_length(p_pet_ids, 1) IS NULL OR array_length(p_pet_ids, 1) = 0 THEN
    RAISE EXCEPTION 'p_pet_ids must contain at least one pet';
  END IF;

  SELECT COUNT(DISTINCT pid) INTO v_distinct_pet_count
  FROM unnest(p_pet_ids) AS pid;
  IF v_distinct_pet_count <> array_length(p_pet_ids, 1) THEN
    RAISE EXCEPTION 'p_pet_ids contains duplicate pet ids';
  END IF;

  SELECT id, validity_months, multi_pet_discount_pct, display_name
  INTO v_package_def_id, v_validity_months, v_multi_pet_discount_pct, v_display_name
  FROM package_definitions
  WHERE code = p_package_code AND is_active = true;

  IF v_package_def_id IS NULL THEN
    RAISE EXCEPTION 'Package % not found or inactive', p_package_code;
  END IF;

  v_pet_count := array_length(p_pet_ids, 1);

  INSERT INTO invoices (
    owner_id, issue_date, status, subtotal, discount_amount, total, payment_method, service_type
  ) VALUES (
    p_owner_id, v_issue, 'issued'::invoice_status, 0, 0, 0, p_payment_method, 'package'
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO purchase_groups (
    owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied
  ) VALUES (
    p_owner_id,
    v_invoice_id,
    v_package_def_id,
    v_pet_count,
    CASE WHEN v_pet_count >= 2 THEN v_multi_pet_discount_pct ELSE 0 END
  )
  RETURNING id INTO v_purchase_group_id;

  FOREACH v_pet_id IN ARRAY p_pet_ids LOOP
    SELECT p.size, p.coat_type, p.name
    INTO v_pet_size, v_pet_coat, v_pet_name
    FROM pets p
    WHERE p.id = v_pet_id AND p.owner_id = p_owner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pet % not found for owner %', v_pet_id, p_owner_id;
    END IF;

    IF v_pet_size IS NULL AND NOT EXISTS (
      SELECT 1 FROM package_pricing
      WHERE package_def_id = v_package_def_id AND pet_size IS NULL AND coat_type IS NULL AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Pet % has no size set and package requires size-based pricing', v_pet_id;
    END IF;

    SELECT pp.amount_aed INTO v_pet_amount
    FROM package_pricing pp
    WHERE pp.package_def_id = v_package_def_id AND pp.is_active = true
      AND (pp.pet_size IS NULL OR pp.pet_size = v_pet_size)
      AND (pp.coat_type IS NULL OR pp.coat_type = v_pet_coat)
    ORDER BY (pp.pet_size IS NOT NULL)::int DESC, (pp.coat_type IS NOT NULL)::int DESC
    LIMIT 1;

    IF v_pet_amount IS NULL THEN
      RAISE EXCEPTION 'No active pricing for package % pet_size % coat_type %', p_package_code, v_pet_size, v_pet_coat;
    END IF;

    INSERT INTO invoice_line_items (
      invoice_id, description, quantity, unit_price, total_price, line_total, service_type
    ) VALUES (
      v_invoice_id,
      v_display_name || ' - ' || COALESCE(v_pet_name, 'Pet'),
      1, v_pet_amount, v_pet_amount, v_pet_amount, 'package'
    );

    v_subtotal := v_subtotal + v_pet_amount;
    v_redemption_groups := '{}'::jsonb;

    FOR v_grant IN
      SELECT service_code, units, is_bonus, exclusive_group
      FROM package_credit_grants
      WHERE package_def_id = v_package_def_id
      ORDER BY sort_order
    LOOP
      IF v_grant.exclusive_group IS NOT NULL THEN
        IF NOT (v_redemption_groups ? v_grant.exclusive_group) THEN
          v_redemption_groups := jsonb_set(
            v_redemption_groups,
            ARRAY[v_grant.exclusive_group],
            to_jsonb(gen_random_uuid()::text),
            true
          );
        END IF;
        v_grant_redemption_group_id := (v_redemption_groups ->> v_grant.exclusive_group)::uuid;
      ELSE
        v_grant_redemption_group_id := NULL;
      END IF;

      INSERT INTO service_credits (
        pet_id, service_code, units_total, expires_at, source_type, source_ref_id,
        purchase_group_id, redemption_group_id, is_bonus
      ) VALUES (
        v_pet_id,
        v_grant.service_code,
        v_grant.units,
        (v_issue + (v_validity_months || ' months')::interval)::date,
        'package_purchase',
        v_invoice_id,
        v_purchase_group_id,
        v_grant_redemption_group_id,
        v_grant.is_bonus
      );

      v_credits_count := v_credits_count + 1;
    END LOOP;
  END LOOP;

  IF v_pet_count >= 2 THEN
    v_discount := ROUND(v_subtotal * v_multi_pet_discount_pct / 100.0, 2);
    INSERT INTO billing_adjustments (
      owner_id, invoice_id, adjustment_type, original_amount, adjusted_amount, reason, approved_by
    ) VALUES (
      p_owner_id, v_invoice_id, 'multi_pet_discount', v_subtotal, -v_discount,
      v_pet_count || '-pet multi-pet discount (' || v_multi_pet_discount_pct || '%)', 'system'
    );
  END IF;

  v_total := v_subtotal - v_discount;

  UPDATE invoices
  SET subtotal = v_subtotal,
      subtotal_aed = v_subtotal,
      discount_amount = v_discount,
      discount_aed = v_discount,
      total = v_total,
      total_aed = v_total
  WHERE id = v_invoice_id;

  RETURN QUERY SELECT v_invoice_id, v_purchase_group_id, v_total, v_discount, v_credits_count;
END
$function$;

-- issue_custom_daycare_package with optional backdate
CREATE OR REPLACE FUNCTION public.issue_custom_daycare_package(
  p_owner_id uuid,
  p_pet_ids uuid[],
  p_units integer,
  p_amount_aed numeric DEFAULT 0,
  p_label text DEFAULT 'Custom daycare package',
  p_validity_months integer DEFAULT 6,
  p_payment_method payment_method DEFAULT 'card'::payment_method,
  p_service_code service_code DEFAULT 'daycare_full_day'::service_code,
  p_issue_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  invoice_id uuid,
  purchase_group_id uuid,
  total_amount_aed numeric,
  discount_applied_aed numeric,
  credits_granted integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_package_def_id uuid;
  v_invoice_id uuid;
  v_purchase_group_id uuid;
  v_subtotal numeric := 0;
  v_total numeric;
  v_pet_id uuid;
  v_pet_name text;
  v_pet_count int;
  v_distinct_pet_count int;
  v_credits_count int := 0;
  v_label text;
  v_line_desc text;
  v_amount numeric;
  v_issue date := coalesce(p_issue_date, CURRENT_DATE);
  v_expires date;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'issue_custom_daycare_package requires authenticated user';
  END IF;

  IF v_issue > CURRENT_DATE THEN
    RAISE EXCEPTION 'p_issue_date cannot be in the future';
  END IF;

  IF array_length(p_pet_ids, 1) IS NULL OR array_length(p_pet_ids, 1) = 0 THEN
    RAISE EXCEPTION 'p_pet_ids must contain at least one pet';
  END IF;

  IF p_units IS NULL OR p_units < 1 OR p_units > 365 THEN
    RAISE EXCEPTION 'p_units must be between 1 and 365';
  END IF;

  IF p_amount_aed IS NULL OR p_amount_aed < 0 THEN
    RAISE EXCEPTION 'p_amount_aed must be >= 0';
  END IF;

  IF p_validity_months IS NULL OR p_validity_months < 1 OR p_validity_months > 36 THEN
    RAISE EXCEPTION 'p_validity_months must be between 1 and 36';
  END IF;

  v_label := nullif(trim(p_label), '');
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'p_label is required';
  END IF;

  IF p_service_code NOT IN ('daycare_full_day', 'daycare_hourly') THEN
    RAISE EXCEPTION 'p_service_code must be daycare_full_day or daycare_hourly';
  END IF;

  SELECT COUNT(DISTINCT pid) INTO v_distinct_pet_count FROM unnest(p_pet_ids) AS pid;
  IF v_distinct_pet_count <> array_length(p_pet_ids, 1) THEN
    RAISE EXCEPTION 'p_pet_ids contains duplicate pet ids';
  END IF;

  SELECT id INTO v_package_def_id FROM package_definitions WHERE code = 'custom_daycare';
  IF v_package_def_id IS NULL THEN
    RAISE EXCEPTION 'custom_daycare package definition missing';
  END IF;

  v_pet_count := array_length(p_pet_ids, 1);
  v_amount := round(p_amount_aed::numeric, 2);
  v_expires := (v_issue + (p_validity_months || ' months')::interval)::date;

  INSERT INTO invoices (
    owner_id, issue_date, status, subtotal, subtotal_aed, discount_amount, discount_aed,
    total, total_aed, vat_aed, payment_method, service_type, notes
  ) VALUES (
    p_owner_id, v_issue,
    CASE WHEN v_amount = 0 THEN 'paid'::invoice_status ELSE 'issued'::invoice_status END,
    0, 0, 0, 0, 0, 0, 0, p_payment_method, 'package', 'Custom daycare package: ' || v_label
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO purchase_groups (
    owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied, staff_label
  ) VALUES (
    p_owner_id, v_invoice_id, v_package_def_id, v_pet_count, 0, v_label
  )
  RETURNING id INTO v_purchase_group_id;

  FOREACH v_pet_id IN ARRAY p_pet_ids LOOP
    SELECT p.name INTO v_pet_name FROM pets p WHERE p.id = v_pet_id AND p.owner_id = p_owner_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pet % not found for owner %', v_pet_id, p_owner_id;
    END IF;

    v_line_desc := v_label || ' — ' || COALESCE(v_pet_name, 'Pet')
      || ' (' || p_units::text || ' '
      || CASE WHEN p_service_code = 'daycare_hourly' THEN 'hourly credits' ELSE 'daycare days' END || ')';

    INSERT INTO invoice_line_items (
      invoice_id, description, quantity, unit_price, total_price, line_total, service_type
    ) VALUES (
      v_invoice_id, v_line_desc, 1, v_amount, v_amount, v_amount, 'package'
    );

    v_subtotal := v_subtotal + v_amount;

    INSERT INTO service_credits (
      pet_id, service_code, units_total, expires_at, source_type, source_ref_id,
      purchase_group_id, is_bonus
    ) VALUES (
      v_pet_id, p_service_code, p_units, v_expires,
      'package_purchase', v_invoice_id, v_purchase_group_id, false
    );

    v_credits_count := v_credits_count + 1;
  END LOOP;

  v_total := v_subtotal;

  UPDATE invoices
  SET subtotal = v_subtotal, subtotal_aed = v_subtotal, total = v_total, total_aed = v_total,
      amount_paid = CASE WHEN v_amount = 0 THEN 0 ELSE 0 END,
      paid_at = CASE WHEN v_amount = 0 THEN now() ELSE NULL END
  WHERE id = v_invoice_id;

  RETURN QUERY SELECT v_invoice_id, v_purchase_group_id, v_total, 0::numeric, v_credits_count;
END
$function$;

-- Verification
SELECT enumlabel FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'payment_method' AND e.enumlabel = 'payment_link';

SELECT proname FROM pg_proc WHERE proname = 'consolidate_owner_invoices';

SELECT id, name, public FROM storage.buckets WHERE name = 'pet-photos';
