-- Tina Rexi / pet Addison — authority fix from MSH wallet + 30-day tickets (Mar 21 & May 5).
-- Keeps existing Lucky Seven credits PKG-90865 / PKG-91214 and their Feb–Mar sessions unchanged.
-- Adds parallel 30-day credits + session history from Package 1 & 2 sheets + wallet ledger + Apr 12 hourly.
--
-- Owner: 5428b67a-61ee-4208-9da4-aebfc6a8acd6 (Tina Rexi)
-- Pet:   4d28e606-8467-4851-a2cd-2a97ec67dc98 (Addison)
-- Package def: thirty_day_ticket (26f00052-5726-4f53-b71b-d9ecdad0e604)
--
-- Run in Supabase SQL editor. Idempotent via tracker + authority wallet note guards.

BEGIN;

DO $$
DECLARE
  v_owner_id uuid := '5428b67a-61ee-4208-9da4-aebfc6a8acd6';
  v_pet_id uuid := '4d28e606-8467-4851-a2cd-2a97ec67dc98';
  v_pkg_def_id uuid := '26f00052-5726-4f53-b71b-d9ecdad0e604';
  v_tracker_mar text := 'PKG-REXI-260321';
  v_tracker_may text := 'PKG-REXI-260505';
  v_wallet_note text := 'authority:rexi_msh_wallet_fix_v1';

  v_inv_mar uuid;
  v_inv_may uuid;
  v_inv_hourly uuid;
  v_pg_mar uuid;
  v_pg_may uuid;
  v_credit_mar uuid;
  v_credit_may uuid;

  v_pkg_amount numeric := 2441.50;
  v_pkg_vat numeric := round(2441.50 - (2441.50 / 1.05), 2);
  v_hourly_amount numeric := 47.25;
  v_hourly_vat numeric := round(47.25 - (47.25 / 1.05), 2);
  v_topup numeric := 9186.65;

  v_balance numeric := 0;
  v_slot int;
  v_date date;
  v_dates_mar date[] := ARRAY[
    '2026-03-21'::date, '2026-03-24'::date, '2026-03-25'::date, '2026-03-26'::date,
    '2026-03-30'::date, '2026-03-31'::date, '2026-04-01'::date, '2026-04-02'::date,
    '2026-04-04'::date, '2026-04-06'::date, '2026-04-07'::date, '2026-04-08'::date,
    '2026-04-09'::date, '2026-04-10'::date, '2026-04-13'::date, '2026-04-14'::date,
    '2026-04-15'::date, '2026-04-16'::date, '2026-04-17'::date, '2026-04-20'::date,
    '2026-04-21'::date, '2026-04-22'::date, '2026-04-23'::date, '2026-04-24'::date,
    '2026-04-27'::date, '2026-04-28'::date, '2026-04-29'::date, '2026-04-30'::date,
    '2026-05-01'::date, '2026-05-04'::date
  ];
  v_dates_may date[] := ARRAY[
    '2026-05-05'::date, '2026-05-06'::date, '2026-05-07'::date, '2026-05-08'::date,
    '2026-05-11'::date, '2026-05-12'::date, '2026-05-13'::date, '2026-05-14'::date,
    '2026-05-15'::date, '2026-05-18'::date, '2026-05-19'::date, '2026-05-20'::date,
    '2026-05-21'::date, '2026-05-22'::date, '2026-05-23'::date, '2026-05-25'::date,
    '2026-05-26'::date
  ];
BEGIN
  IF EXISTS (
    SELECT 1 FROM wallet_transactions wt
    WHERE wt.owner_id = v_owner_id AND wt.notes = v_wallet_note
  ) THEN
    RAISE NOTICE 'Already applied (%). Skipping.', v_wallet_note;
    RETURN;
  END IF;

  -- ── Mar 21 — 30 Day Ticket (30/30 used) ─────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM invoices i WHERE i.notes LIKE '%tracker=' || v_tracker_mar || '%'
  ) THEN
    INSERT INTO invoices (
      owner_id, issue_date, status,
      subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
      total, total_aed, vat_aed,
      payment_method, service_type, notes,
      paid_at, amount_paid
    ) VALUES (
      v_owner_id, '2026-03-21', 'paid',
      v_pkg_amount, v_pkg_amount, 0, 0, 0,
      v_pkg_amount, v_pkg_amount, v_pkg_vat,
      'wallet', 'package',
      'Legacy daycare package purchase | tracker=' || v_tracker_mar ||
        ' | raw_type=30 Day Ticket | authority=MSH_invoice_mar21',
      '2026-03-21 12:00:00+00', v_pkg_amount
    )
    RETURNING id INTO v_inv_mar;

    INSERT INTO purchase_groups (owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
    VALUES (v_owner_id, v_inv_mar, v_pkg_def_id, 1, 0)
    RETURNING id INTO v_pg_mar;

    INSERT INTO invoice_line_items (
      invoice_id, description, quantity, unit_price, total_price, line_total, service_type
    ) VALUES (
      v_inv_mar, '30 Day Ticket — Addison (Mar 21 2026)', 1,
      v_pkg_amount, v_pkg_amount, v_pkg_amount, 'package'
    );

    INSERT INTO service_credits (
      pet_id, service_code, units_total, units_consumed, expires_at,
      source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
    ) VALUES (
      v_pet_id, 'daycare_full_day', 30, 30, '2026-09-21',
      'package_purchase', v_inv_mar, v_pg_mar, false, 'active', '2026-03-21 00:00:00+00'
    )
    RETURNING id INTO v_credit_mar;
  ELSE
    SELECT sc.id INTO v_credit_mar
    FROM service_credits sc
    JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
    JOIN invoices i ON i.id = pg.invoice_id
    WHERE i.notes LIKE '%tracker=' || v_tracker_mar || '%'
      AND sc.pet_id = v_pet_id
    LIMIT 1;
  END IF;

  -- ── May 5 — 30 Day Ticket (17/30 used) ─────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM invoices i WHERE i.notes LIKE '%tracker=' || v_tracker_may || '%'
  ) THEN
    INSERT INTO invoices (
      owner_id, issue_date, status,
      subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
      total, total_aed, vat_aed,
      payment_method, service_type, notes,
      paid_at, amount_paid
    ) VALUES (
      v_owner_id, '2026-05-05', 'paid',
      v_pkg_amount, v_pkg_amount, 0, 0, 0,
      v_pkg_amount, v_pkg_amount, v_pkg_vat,
      'wallet', 'package',
      'Legacy daycare package purchase | tracker=' || v_tracker_may ||
        ' | raw_type=30 Day Ticket | authority=MSH_invoice_may5',
      '2026-05-05 12:00:00+00', v_pkg_amount
    )
    RETURNING id INTO v_inv_may;

    INSERT INTO purchase_groups (owner_id, invoice_id, package_def_id, pet_count, multi_pet_discount_applied)
    VALUES (v_owner_id, v_inv_may, v_pkg_def_id, 1, 0)
    RETURNING id INTO v_pg_may;

    INSERT INTO invoice_line_items (
      invoice_id, description, quantity, unit_price, total_price, line_total, service_type
    ) VALUES (
      v_inv_may, '30 Day Ticket — Addison (May 5 2026)', 1,
      v_pkg_amount, v_pkg_amount, v_pkg_amount, 'package'
    );

    INSERT INTO service_credits (
      pet_id, service_code, units_total, units_consumed, expires_at,
      source_type, source_ref_id, purchase_group_id, is_bonus, status, created_at
    ) VALUES (
      v_pet_id, 'daycare_full_day', 30, 17, '2026-11-05',
      'package_purchase', v_inv_may, v_pg_may, false, 'active', '2026-05-05 00:00:00+00'
    )
    RETURNING id INTO v_credit_may;
  ELSE
    SELECT sc.id INTO v_credit_may
    FROM service_credits sc
    JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
    JOIN invoices i ON i.id = pg.invoice_id
    WHERE i.notes LIKE '%tracker=' || v_tracker_may || '%'
      AND sc.pet_id = v_pet_id
    LIMIT 1;
  END IF;

  -- ── Apr 12 — hourly daycare (paid via wallet) ──────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.owner_id = v_owner_id
      AND i.service_type = 'daycare'
      AND i.notes LIKE '%authority=rexi_hourly_2026-04-12%'
  ) THEN
    INSERT INTO invoices (
      owner_id, issue_date, status,
      subtotal, subtotal_aed, discount_amount, discount_aed, discount_pct,
      total, total_aed, vat_aed,
      payment_method, service_type, notes,
      paid_at, amount_paid
    ) VALUES (
      v_owner_id, '2026-04-12', 'paid',
      v_hourly_amount, v_hourly_amount, 0, 0, 0,
      v_hourly_amount, v_hourly_amount, v_hourly_vat,
      'wallet', 'daycare',
      'Daycare hourly — Addison 12:30–17:00 | authority=rexi_hourly_2026-04-12 | VAT inclusive',
      '2026-04-12 17:00:00+00', v_hourly_amount
    )
    RETURNING id INTO v_inv_hourly;

    INSERT INTO invoice_line_items (
      invoice_id, description, quantity, unit_price, total_price, line_total,
      service_type, pricing_key
    ) VALUES (
      v_inv_hourly,
      'Daycare hourly — Addison (12:30–17:00)',
      1, v_hourly_amount, v_hourly_amount, v_hourly_amount,
      'daycare', 'daycare_hourly'
    );

    INSERT INTO daycare_sessions (
      owner_id, pet_id, package_id, session_date, checked_in, notes, created_at
    )
    SELECT v_owner_id, v_pet_id, NULL, '2026-04-12'::date, true,
      'Authority fix | hourly | invoice=rexi_hourly_2026-04-12',
      '2026-04-12 17:00:00+00'
    WHERE NOT EXISTS (
      SELECT 1 FROM daycare_sessions ds
      WHERE ds.pet_id = v_pet_id AND ds.session_date = '2026-04-12'::date
    );
  ELSE
    SELECT i.id INTO v_inv_hourly
    FROM invoices i
    WHERE i.owner_id = v_owner_id AND i.notes LIKE '%authority=rexi_hourly_2026-04-12%'
    LIMIT 1;
  END IF;

  SELECT i.id INTO v_inv_mar FROM invoices i WHERE i.notes LIKE '%tracker=' || v_tracker_mar || '%' LIMIT 1;
  SELECT i.id INTO v_inv_may FROM invoices i WHERE i.notes LIKE '%tracker=' || v_tracker_may || '%' LIMIT 1;

  -- ── Wallet ledger (MSH top-up + package/hourly deductions) ─────────────────
  v_balance := v_topup;
  INSERT INTO wallet_transactions (
    owner_id, transaction_type, amount, balance_after, notes, performed_by, created_at
  ) VALUES (
    v_owner_id, 'manual_topup', v_topup, v_balance,
    v_wallet_note || ' | Credit from My Second Home (MSH)',
    'staff_authority', '2026-03-21 10:00:00+00'
  );

  v_balance := round(v_balance - v_pkg_amount, 2);
  INSERT INTO wallet_transactions (
    owner_id, transaction_type, amount, balance_after, invoice_id, notes, performed_by, created_at
  ) VALUES (
    v_owner_id, 'deduction', -v_pkg_amount, v_balance, v_inv_mar,
    v_wallet_note || ' | 30 Day Ticket Mar 21 2026',
    'staff_authority', '2026-03-21 12:00:00+00'
  );

  v_balance := round(v_balance - v_hourly_amount, 2);
  INSERT INTO wallet_transactions (
    owner_id, transaction_type, amount, balance_after, invoice_id, notes, performed_by, created_at
  ) VALUES (
    v_owner_id, 'deduction', -v_hourly_amount, v_balance, v_inv_hourly,
    v_wallet_note || ' | Daycare hourly Apr 12 2026',
    'staff_authority', '2026-04-12 17:00:00+00'
  );

  v_balance := round(v_balance - v_pkg_amount, 2);
  INSERT INTO wallet_transactions (
    owner_id, transaction_type, amount, balance_after, invoice_id, notes, performed_by, created_at
  ) VALUES (
    v_owner_id, 'deduction', -v_pkg_amount, v_balance, v_inv_may,
    v_wallet_note || ' | 30 Day Ticket May 5 2026',
    'staff_authority', '2026-05-05 12:00:00+00'
  );

  UPDATE owners SET wallet_balance = v_balance WHERE id = v_owner_id;

  -- ── Sessions on NEW 30-day credits only (Package 1 & 2 sheets) ─────────────
  IF v_credit_mar IS NOT NULL THEN
    v_slot := 0;
    FOREACH v_date IN ARRAY v_dates_mar LOOP
      v_slot := v_slot + 1;
      INSERT INTO daycare_sessions (owner_id, pet_id, package_id, session_date, checked_in, notes)
      SELECT v_owner_id, v_pet_id, v_credit_mar, v_date, true,
        'Authority fix | tracker=' || v_tracker_mar ||
        ' | slot=U' || v_slot::text || ' | package_sheet=Package1'
      WHERE NOT EXISTS (
        SELECT 1 FROM daycare_sessions ds
        WHERE ds.pet_id = v_pet_id
          AND ds.package_id = v_credit_mar
          AND ds.session_date = v_date
      );
    END LOOP;
  END IF;

  IF v_credit_may IS NOT NULL THEN
    v_slot := 0;
    FOREACH v_date IN ARRAY v_dates_may LOOP
      v_slot := v_slot + 1;
      INSERT INTO daycare_sessions (owner_id, pet_id, package_id, session_date, checked_in, notes)
      SELECT v_owner_id, v_pet_id, v_credit_may, v_date, true,
        'Authority fix | tracker=' || v_tracker_may ||
        ' | slot=U' || v_slot::text || ' | package_sheet=Package2'
      WHERE NOT EXISTS (
        SELECT 1 FROM daycare_sessions ds
        WHERE ds.pet_id = v_pet_id
          AND ds.package_id = v_credit_may
          AND ds.session_date = v_date
      );
    END LOOP;
  END IF;

  RAISE NOTICE 'Addison Rexi fix applied. Wallet balance: %', v_balance;
END;
$$;

COMMIT;

-- Verification (paste after COMMIT)
SELECT o.wallet_balance, o.first_name, o.last_name
FROM owners o
WHERE o.id = '5428b67a-61ee-4208-9da4-aebfc6a8acd6';

SELECT wt.created_at::date, wt.transaction_type, wt.amount, wt.balance_after, left(wt.notes, 50) AS notes
FROM wallet_transactions wt
WHERE wt.owner_id = '5428b67a-61ee-4208-9da4-aebfc6a8acd6'
ORDER BY wt.created_at;

SELECT i.issue_date, i.total_aed, i.status, left(i.notes, 70) AS notes
FROM invoices i
WHERE i.owner_id = '5428b67a-61ee-4208-9da4-aebfc6a8acd6'
  AND (i.notes LIKE '%PKG-REXI-%' OR i.notes LIKE '%rexi_hourly%')
ORDER BY i.issue_date;

SELECT left(i.notes, 40) AS tracker, sc.units_total, sc.units_consumed, sc.expires_at,
  (SELECT COUNT(*) FROM daycare_sessions ds WHERE ds.package_id = sc.id) AS session_rows
FROM service_credits sc
JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
JOIN invoices i ON i.id = pg.invoice_id
WHERE sc.pet_id = '4d28e606-8467-4851-a2cd-2a97ec67dc98'
ORDER BY sc.created_at;

-- Lucky Seven packages must still exist (unchanged)
SELECT left(i.notes, 50) AS legacy_tracker, sc.units_total, sc.units_consumed
FROM service_credits sc
JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
JOIN invoices i ON i.id = pg.invoice_id
WHERE sc.pet_id = '4d28e606-8467-4851-a2cd-2a97ec67dc98'
  AND (i.notes LIKE '%PKG-90865%' OR i.notes LIKE '%PKG-91214%');
