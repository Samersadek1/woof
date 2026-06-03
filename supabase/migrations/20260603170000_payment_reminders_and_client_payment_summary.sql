-- Part 1: payment_reminders audit log for client payment outreach

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES public.owners(id),
  channel         text NOT NULL DEFAULT 'whatsapp',
  amount_at_time  numeric NOT NULL,
  sent_by         text NOT NULL,
  notes           text,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_owner_id
  ON public.payment_reminders(owner_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_sent_at
  ON public.payment_reminders(owner_id, sent_at DESC);

-- Part 2: single-owner payment summary for client payments view

CREATE OR REPLACE FUNCTION public.get_client_payment_summary(p_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_wallet        numeric;
  v_due_now       numeric;
  v_in_progress   numeric;
  v_aging         jsonb;
  v_breakdown     jsonb;
  v_last_reminder jsonb;
  v_recent_pay    jsonb;
  v_owner         jsonb;
BEGIN
  -- Wallet (held separate from debt)
  SELECT COALESCE(wallet_balance, 0) INTO v_wallet
  FROM owners WHERE id = p_owner_id;

  -- Owner + pets
  SELECT jsonb_build_object(
    'owner_id', o.id,
    'first_name', o.first_name,
    'last_name', o.last_name,
    'phone', o.phone,
    'email', o.email,
    'pets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name))
      FROM pets p WHERE p.owner_id = o.id
    ), '[]'::jsonb)
  ) INTO v_owner
  FROM owners o WHERE o.id = p_owner_id;

  -- Due now (collectable)
  SELECT COALESCE(SUM(total - amount_paid), 0) INTO v_due_now
  FROM invoices
  WHERE owner_id = p_owner_id
    AND receipt_only = false
    AND status IN ('outstanding','overdue','partially_paid')
    AND (total - amount_paid) > 0;

  -- In progress (drafts)
  SELECT COALESCE(SUM(total - amount_paid), 0) INTO v_in_progress
  FROM invoices
  WHERE owner_id = p_owner_id
    AND receipt_only = false
    AND status = 'draft'
    AND (total - amount_paid) > 0;

  -- Aging buckets on collectable debt, derived from due_date
  SELECT jsonb_build_object(
    'current', COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date >= current_date THEN bal ELSE 0 END), 0),
    'd30',     COALESCE(SUM(CASE WHEN due_date < current_date AND due_date >= current_date - 30 THEN bal ELSE 0 END), 0),
    'd60',     COALESCE(SUM(CASE WHEN due_date < current_date - 30 AND due_date >= current_date - 60 THEN bal ELSE 0 END), 0),
    'd90plus', COALESCE(SUM(CASE WHEN due_date < current_date - 60 THEN bal ELSE 0 END), 0)
  ) INTO v_aging
  FROM (
    SELECT due_date, (total - amount_paid) AS bal
    FROM invoices
    WHERE owner_id = p_owner_id
      AND receipt_only = false
      AND status IN ('outstanding','overdue','partially_paid')
      AND (total - amount_paid) > 0
  ) t;

  -- Service breakdown — grouped, with invoice list per group
  SELECT COALESCE(jsonb_agg(grp), '[]'::jsonb) INTO v_breakdown
  FROM (
    SELECT jsonb_build_object(
      'service_type', COALESCE(service_type, 'other'),
      'is_draft', is_draft,
      'total_balance', SUM(bal),
      'invoices', jsonb_agg(jsonb_build_object(
        'id', id,
        'invoice_number', invoice_number,
        'status', status,
        'balance', bal,
        'due_date', due_date,
        'days_overdue', CASE WHEN due_date < current_date THEN current_date - due_date ELSE 0 END
      ) ORDER BY due_date NULLS LAST)
    ) AS grp
    FROM (
      SELECT id, invoice_number, status, due_date,
             COALESCE(service_type, 'other') AS service_type,
             (total - amount_paid) AS bal,
             (status = 'draft') AS is_draft
      FROM invoices
      WHERE owner_id = p_owner_id
        AND receipt_only = false
        AND status IN ('outstanding','overdue','partially_paid','draft')
        AND (total - amount_paid) > 0
    ) inv
    GROUP BY COALESCE(service_type, 'other'), is_draft
  ) groups;

  -- Last reminder
  SELECT to_jsonb(r) INTO v_last_reminder
  FROM (
    SELECT channel, amount_at_time, sent_by, sent_at, notes
    FROM payment_reminders
    WHERE owner_id = p_owner_id
    ORDER BY sent_at DESC
    LIMIT 1
  ) r;

  -- Recent payments (last 10)
  SELECT COALESCE(jsonb_agg(p ORDER BY p.created_at DESC), '[]'::jsonb) INTO v_recent_pay
  FROM (
    SELECT ip.amount, ip.payment_method, ip.created_at, ip.recorded_by, i.invoice_number
    FROM invoice_payments ip
    JOIN invoices i ON i.id = ip.invoice_id
    WHERE ip.owner_id = p_owner_id
    ORDER BY ip.created_at DESC
    LIMIT 10
  ) p;

  RETURN jsonb_build_object(
    'owner', v_owner,
    'wallet_credit', v_wallet,
    'due_now', v_due_now,
    'in_progress', v_in_progress,
    'net_position', v_wallet - v_due_now,
    'aging', v_aging,
    'service_breakdown', v_breakdown,
    'last_reminder', v_last_reminder,
    'recent_payments', v_recent_pay
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_payment_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_payment_summary(uuid) TO service_role;
