-- ============================================================
-- MSH Admin Essentials — Invoice System Schema Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to run multiple times (uses IF NOT EXISTS / DO NOTHING)
-- ============================================================

-- ── 1. Extend invoice_status enum ───────────────────────────
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'finalised';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'voided';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'outstanding';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'overdue';

-- ── 2. Extend transaction_type enum ─────────────────────────
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'card_payment';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'cash_payment';

-- ── 3. Create pricing table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing (
  key        VARCHAR PRIMARY KEY,
  amount_aed NUMERIC NOT NULL DEFAULT 0,
  label      VARCHAR NOT NULL DEFAULT '',
  category   VARCHAR NOT NULL DEFAULT 'other',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing_all" ON pricing;
CREATE POLICY "pricing_all" ON pricing FOR ALL USING (true) WITH CHECK (true);

-- ── 4. Create billing_adjustments table ─────────────────────
CREATE TABLE IF NOT EXISTS billing_adjustments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id         UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  booking_id       UUID REFERENCES bookings(id) ON DELETE SET NULL,
  invoice_id       UUID REFERENCES invoices(id) ON DELETE SET NULL,
  adjustment_type  VARCHAR NOT NULL,
  original_amount  NUMERIC,
  adjusted_amount  NUMERIC,
  reason           TEXT NOT NULL DEFAULT '',
  approved_by      TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE billing_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_adjustments_all" ON billing_adjustments;
CREATE POLICY "billing_adjustments_all" ON billing_adjustments FOR ALL USING (true) WITH CHECK (true);

-- ── 5. Extend invoices table ─────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS service_type  VARCHAR,
  ADD COLUMN IF NOT EXISTS service_id    UUID,
  ADD COLUMN IF NOT EXISTS subtotal_aed  NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_aed     NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_aed  NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_reason TEXT;

-- Backfill AED columns from legacy columns on existing rows
UPDATE invoices
SET
  subtotal_aed = COALESCE(subtotal, 0),
  total_aed    = COALESCE(total, 0),
  discount_aed = COALESCE(discount_amount, 0)
WHERE subtotal_aed = 0 AND (subtotal > 0 OR total > 0);

-- ── 6. Extend invoice_line_items table ──────────────────────
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS pricing_key VARCHAR,
  ADD COLUMN IF NOT EXISTS line_total  NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order  INT NOT NULL DEFAULT 0;

-- Backfill line_total from total_price on existing rows
UPDATE invoice_line_items SET line_total = total_price WHERE line_total = 0 AND total_price > 0;

-- ── 7. Extend wallet_transactions table ─────────────────────
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS invoice_id   UUID REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS performed_by TEXT;

-- ── 8. Seed / fix room nightly_rates ────────────────────────
UPDATE rooms SET nightly_rate = 750  WHERE room_type = 'presidential_super'          AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 500  WHERE room_type = 'presidential_standard'       AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 450  WHERE room_type = 'royal_suite_double'          AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 350  WHERE room_type = 'royal_suite_single'          AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 300  WHERE room_type = 'double_royal'                AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 220  WHERE room_type = 'single_royal'                AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 500  WHERE room_type = 'family_room'                 AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 280  WHERE room_type = 'royal_annex'                 AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 300  WHERE room_type = 'cattery_super_presidential'  AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 220  WHERE room_type = 'cattery_presidential'        AND (nightly_rate IS NULL OR nightly_rate = 0);
UPDATE rooms SET nightly_rate = 150  WHERE room_type = 'cattery_deluxe'              AND (nightly_rate IS NULL OR nightly_rate = 0);

-- ── 9. Seed pricing table ────────────────────────────────────
-- Single occupancy (base rate)
INSERT INTO pricing (key, amount_aed, label, category)
SELECT
  r.room_type::text || '_single',
  COALESCE(MAX(r.nightly_rate), 0),
  INITCAP(REPLACE(r.room_type::text, '_', ' ')) || ' (Single)',
  'boarding'
FROM rooms r WHERE r.room_type IS NOT NULL
GROUP BY r.room_type
ON CONFLICT (key) DO NOTHING;

-- Twin occupancy (1.5× base rate)
INSERT INTO pricing (key, amount_aed, label, category)
SELECT
  r.room_type::text || '_twin',
  ROUND(COALESCE(MAX(r.nightly_rate), 0) * 1.5),
  INITCAP(REPLACE(r.room_type::text, '_', ' ')) || ' (Twin)',
  'boarding'
FROM rooms r WHERE r.room_type IS NOT NULL
GROUP BY r.room_type
ON CONFLICT (key) DO NOTHING;

-- Multiple occupancy (2× base rate)
INSERT INTO pricing (key, amount_aed, label, category)
SELECT
  r.room_type::text || '_multiple',
  ROUND(COALESCE(MAX(r.nightly_rate), 0) * 2.0),
  INITCAP(REPLACE(r.room_type::text, '_', ' ')) || ' (Multiple)',
  'boarding'
FROM rooms r WHERE r.room_type IS NOT NULL
GROUP BY r.room_type
ON CONFLICT (key) DO NOTHING;

-- Base key (no occupancy suffix) as catch-all fallback
INSERT INTO pricing (key, amount_aed, label, category)
SELECT
  r.room_type::text,
  COALESCE(MAX(r.nightly_rate), 0),
  INITCAP(REPLACE(r.room_type::text, '_', ' ')),
  'boarding'
FROM rooms r WHERE r.room_type IS NOT NULL
GROUP BY r.room_type
ON CONFLICT (key) DO NOTHING;

-- Add-ons
INSERT INTO pricing (key, amount_aed, label, category) VALUES
  ('transport_dubai',      150, 'Transport (Dubai)',      'transport'),
  ('transport_abudhabi',   250, 'Transport (Abu Dhabi)',  'transport'),
  ('grooming_full_groom',  200, 'Full Groom',             'grooming'),
  ('grooming_full_bath',   120, 'Full Bath',              'grooming'),
  ('grooming_nail_clip',    60, 'Nail Clip',              'grooming'),
  ('grooming_deshedding',  150, 'Deshedding',             'grooming'),
  ('daycare_single_day',    80, 'Daycare Day',            'daycare'),
  ('park_slot',             50, 'Park Slot',              'park')
ON CONFLICT (key) DO NOTHING;

-- ── 10. Create apply_member_discount RPC ────────────────────
CREATE OR REPLACE FUNCTION apply_member_discount(
  p_owner_id UUID,
  p_subtotal  NUMERIC
)
RETURNS TABLE (
  discount_pct NUMERIC,
  discount_aed NUMERIC,
  final_aed    NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member_type TEXT;
  v_pct         NUMERIC := 0;
BEGIN
  SELECT member_type::TEXT INTO v_member_type FROM owners WHERE id = p_owner_id;

  CASE v_member_type
    WHEN 'gold'   THEN v_pct := 20;
    WHEN 'silver' THEN v_pct := 10;
    ELSE               v_pct := 0;
  END CASE;

  RETURN QUERY SELECT
    v_pct,
    ROUND(p_subtotal * v_pct / 100.0, 2),
    ROUND(p_subtotal * (1.0 - v_pct / 100.0), 2);
END;
$$;

-- ── 11. Create process_wallet_payment RPC ───────────────────
CREATE OR REPLACE FUNCTION process_wallet_payment(
  p_invoice_id   UUID,
  p_performed_by TEXT DEFAULT 'system'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_owner_id    UUID;
  v_amount      NUMERIC;
  v_balance     NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Get invoice details
  SELECT owner_id, COALESCE(total_aed, total, 0)
  INTO v_owner_id, v_amount
  FROM invoices WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN '{"success":false,"error":"Invoice not found"}'::JSON;
  END IF;

  -- Get current wallet balance
  SELECT wallet_balance INTO v_balance FROM owners WHERE id = v_owner_id;

  IF v_balance < v_amount THEN
    RETURN json_build_object(
      'success',   false,
      'error',     'Insufficient wallet balance',
      'shortfall', ROUND(v_amount - v_balance, 2)
    );
  END IF;

  v_new_balance := ROUND(v_balance - v_amount, 2);

  -- Update owner balance
  UPDATE owners SET wallet_balance = v_new_balance WHERE id = v_owner_id;

  -- Mark invoice paid
  UPDATE invoices SET
    status         = 'paid',
    payment_method = 'wallet',
    paid_at        = NOW(),
    amount_paid    = v_amount
  WHERE id = p_invoice_id;

  -- Record wallet transaction
  INSERT INTO wallet_transactions
    (owner_id, transaction_type, amount, balance_after, invoice_id, performed_by, notes)
  VALUES
    (v_owner_id, 'deduction', -v_amount, v_new_balance, p_invoice_id, p_performed_by, 'Invoice payment via wallet');

  RETURN json_build_object(
    'success',        true,
    'amount_charged', v_amount,
    'new_balance',    v_new_balance
  );
END;
$$;

-- ── 12. Create get_statement_of_account RPC ─────────────────
CREATE OR REPLACE FUNCTION get_statement_of_account(p_owner_id UUID)
RETURNS TABLE (
  invoice_id     UUID,
  invoice_number VARCHAR,
  service_type   VARCHAR,
  status         TEXT,
  total_aed      NUMERIC,
  created_at     TIMESTAMPTZ,
  due_date       DATE,
  days_overdue   INT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.service_type,
    i.status::TEXT,
    COALESCE(i.total_aed, i.total, 0),
    i.created_at,
    i.due_date,
    CASE
      WHEN i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
        AND i.status::TEXT NOT IN ('paid', 'voided', 'cancelled')
      THEN (CURRENT_DATE - i.due_date)::INT
      ELSE 0
    END
  FROM invoices i
  WHERE i.owner_id = p_owner_id
  ORDER BY i.created_at DESC;
END;
$$;

-- ── 13. Create calculate_cancellation_refund RPC ─────────────
CREATE OR REPLACE FUNCTION calculate_cancellation_refund(
  p_owner_id    UUID,
  p_invoice_id  UUID,
  p_service_start TEXT
)
RETURNS TABLE (
  hours_notice    NUMERIC,
  refund_pct      NUMERIC,
  refund_aed      NUMERIC,
  override_active BOOLEAN,
  policy_label    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_invoice_total NUMERIC;
  v_hours         NUMERIC;
  v_pct           NUMERIC;
  v_label         TEXT;
BEGIN
  SELECT COALESCE(total_aed, total, 0) INTO v_invoice_total
  FROM invoices WHERE id = p_invoice_id;

  v_hours := EXTRACT(EPOCH FROM (p_service_start::TIMESTAMPTZ - NOW())) / 3600.0;
  v_hours := GREATEST(v_hours, 0);

  IF v_hours >= 72 THEN
    v_pct   := 100; v_label := 'Full refund (72+ hrs notice)';
  ELSIF v_hours >= 48 THEN
    v_pct   := 75;  v_label := '75% refund (48–72 hrs notice)';
  ELSIF v_hours >= 24 THEN
    v_pct   := 50;  v_label := '50% refund (24–48 hrs notice)';
  ELSE
    v_pct   := 0;   v_label := 'No refund (less than 24 hrs notice)';
  END IF;

  RETURN QUERY SELECT
    ROUND(v_hours, 1),
    v_pct,
    ROUND(v_invoice_total * v_pct / 100.0, 2),
    FALSE,
    v_label;
END;
$$;

-- ── Done ─────────────────────────────────────────────────────
-- After running this script, regenerate types with:
--   npx supabase gen types typescript --project-id <your-project-id> > src/integrations/supabase/types.ts
