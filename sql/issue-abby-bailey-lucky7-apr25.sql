-- Abby & Bailey Menon — Lucky 7 purchased 2026-04-25, 6 of 7 days used (authority dates).
-- Tracker PKG-92525 (Apr 25 start). Separate from legacy PKG-91309 (Feb–Apr period).

BEGIN;

DO $$
DECLARE
  v_owner_id uuid := '841d57f1-2b12-47e0-82d7-c5c8e15f0031';
  v_abby_pet uuid := '1e8cb4f2-5952-4b45-b522-95f675919945';
  v_bailey_pet uuid := '0fbb370d-4605-4bf7-83c8-1f824b96843c';
  v_package_def_id uuid := '1adc1cbd-981d-45c1-aee4-1661df7151ba';
  v_tracker text := 'PKG-92525';
  v_invoice_id uuid;
  v_pg_id uuid;
  v_abby_credit uuid;
  v_bailey_credit uuid;
  v_pet_id uuid;
  v_credit_id uuid;
  v_slot int;
  v_date date;
  v_dates date[] := ARRAY[
    '2026-04-25'::date,
    '2026-05-02'::date,
    '2026-05-09'::date,
    '2026-05-16'::date,
    '2026-05-23'::date,
    '2026-05-26'::date
  ];
BEGIN
  IF EXISTS (
    SELECT 1 FROM invoices i WHERE i.notes LIKE '%tracker=' || v_tracker || '%'
  ) THEN
    RAISE EXCEPTION 'Tracker % already exists', v_tracker;
  END IF;

  INSERT INTO invoices (
    owner_id, issue_date, status,
    subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
    total, total_aed, vat_aed,
    payment_method, service_type, notes,
    paid_at, amount_paid
  ) VALUES (
    v_owner_id,
    '2026-04-25',
    'paid',
    1058.40, 1058.40, 0, 0, 0,
    1058.40, 1058.40,
    round(1058.40 - (1058.40 / 1.05), 2),
    'card',
    'package',
    'Legacy daycare package purchase | tracker=' || v_tracker || ' | raw_type=Lucky Seven',
    now(),
    1058.40
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO purchase_groups (
    owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied
  ) VALUES (
    v_owner_id, v_invoice_id, v_package_def_id, 2, 20
  )
  RETURNING id INTO v_pg_id;

  INSERT INTO invoice_line_items (
    invoice_id, description, quantity, unit_price, total_price, line_total, service_type
  ) VALUES (
    v_invoice_id,
    'Package: lucky_7 (14 sessions)',
    1,
    1058.40,
    1058.40,
    1058.40,
    'package'
  );

  INSERT INTO service_credits (
    pet_id, service_code, units_total, units_consumed, expires_at,
    source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
  ) VALUES (
    v_abby_pet, 'daycare_full_day', 7, 6, '2026-06-25',
    'package_purchase', v_invoice_id, v_pg_id, false, 'active', '2026-04-25 00:00:00+00'
  )
  RETURNING id INTO v_abby_credit;

  INSERT INTO service_credits (
    pet_id, service_code, units_total, units_consumed, expires_at,
    source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
  ) VALUES (
    v_bailey_pet, 'daycare_full_day', 7, 6, '2026-06-25',
    'package_purchase', v_invoice_id, v_pg_id, false, 'active', '2026-04-25 00:00:00+00'
  )
  RETURNING id INTO v_bailey_credit;

  FOREACH v_pet_id IN ARRAY ARRAY[v_abby_pet, v_bailey_pet] LOOP
    v_credit_id := CASE WHEN v_pet_id = v_abby_pet THEN v_abby_credit ELSE v_bailey_credit END;
    v_slot := 0;
    FOREACH v_date IN ARRAY v_dates LOOP
      v_slot := v_slot + 1;
      INSERT INTO daycare_sessions (owner_id, pet_id, package_id, session_date, checked_in, notes)
      SELECT v_owner_id, v_pet_id, v_credit_id, v_date, true,
        'Legacy migration | tracker=' || v_tracker ||
        ' | slot=U' || v_slot::text ||
        ' | recovered=staff_authority | date_raw=' || v_date::text
      WHERE NOT EXISTS (
        SELECT 1 FROM daycare_sessions ds
        WHERE ds.pet_id = v_pet_id
          AND ds.package_id = v_credit_id
          AND ds.session_date = v_date
      );
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- Verification
SELECT p.name AS pet,
  sc.id AS credit_id,
  sc.units_total,
  sc.units_consumed,
  sc.units_total - sc.units_consumed AS remaining,
  sc.created_at::date AS package_start,
  sc.expires_at,
  i.notes AS invoice_notes,
  (SELECT COUNT(*)::int FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS sessions_linked,
  (SELECT string_agg(ds.session_date::text, ', ' ORDER BY ds.session_date)
   FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS session_dates
FROM service_credits sc
JOIN pets p ON p.id = sc.pet_id
JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
JOIN invoices i ON i.id = pg.invoice_id
WHERE i.notes LIKE '%tracker=PKG-92525%'
ORDER BY p.name;
