-- SOA ledger: gross helpers, statement RPC fix, get_ledger_statement (non-migrated path).
-- Date bounds: p_from / p_to are UTC instants; frontend passes Dubai calendar day edges (+04:00).

-- ── 1. Gross total (mirrors invoiceAmountDue / get_statement_of_account VAT rules) ──

CREATE OR REPLACE FUNCTION public.invoice_gross_total(
  p_total numeric,
  p_vat_aed numeric,
  p_service_type character varying,
  p_notes text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_vat_aed IS NOT NULL
      OR p_service_type IN ('package', 'daycare')
      OR COALESCE(p_notes, '') LIKE 'Legacy daycare package purchase%' THEN
      ROUND(COALESCE(p_total, 0), 2)
    ELSE
      ROUND(
        COALESCE(p_total, 0) + ROUND(COALESCE(p_total, 0) * 0.05, 2),
        2
      )
  END;
$$;

-- ── 2. Visibility helpers ──

CREATE OR REPLACE FUNCTION public.is_soa_invoice_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status NOT IN ('voided', 'consolidated', 'cancelled');
$$;

CREATE OR REPLACE FUNCTION public.is_collectable_invoice_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IN ('outstanding', 'overdue', 'partially_paid');
$$;

CREATE OR REPLACE FUNCTION public.is_ledger_wallet_event(
  p_invoice_id uuid,
  p_transaction_type public.transaction_type
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_invoice_id IS NULL
    AND p_transaction_type IN (
      'top_up',
      'manual_topup',
      'refund',
      'adjustment',
      'membership_fee'
    );
$$;

-- ── 3. Settled amount on invoice (invoice_payments first, legacy amount_paid fallback) ──

CREATE OR REPLACE FUNCTION public.invoice_settled_amount(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT ROUND(
    COALESCE(
      NULLIF(
        (SELECT SUM(ip.amount) FROM public.invoice_payments ip WHERE ip.invoice_id = p_invoice_id),
        0
      ),
      (SELECT i.amount_paid FROM public.invoices i WHERE i.id = p_invoice_id),
      0
    ),
    2
  );
$$;

CREATE OR REPLACE FUNCTION public.invoice_ledger_amount(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT -GREATEST(
    0,
    public.invoice_gross_total(i.total, i.vat_aed, i.service_type, i.notes)
      - public.invoice_settled_amount(i.id)
  )
  FROM public.invoices i
  WHERE i.id = p_invoice_id;
$$;

CREATE OR REPLACE FUNCTION public.invoice_payment_tx_type(p_method public.payment_method)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_method
    WHEN 'card' THEN 'card_payment'
    WHEN 'cash' THEN 'cash_payment'
    WHEN 'bank_transfer' THEN 'bank_transfer_payment'
    WHEN 'payment_link' THEN 'payment_link_payment'
    WHEN 'wallet' THEN 'wallet_payment'
    ELSE 'manual_topup'
  END;
$$;

-- ── 4. Open invoice list (remaining balances) ──

DROP FUNCTION IF EXISTS public.get_statement_of_account(uuid);

CREATE OR REPLACE FUNCTION public.get_statement_of_account(p_owner_id uuid)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number character varying,
  service_type character varying,
  status text,
  total numeric,
  amount_paid numeric,
  created_at timestamp with time zone,
  due_date date,
  days_overdue integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.service_type,
    i.status::text,
    GREATEST(
      0,
      public.invoice_gross_total(i.total, i.vat_aed, i.service_type, i.notes)
        - ROUND(COALESCE(i.amount_paid, 0), 2)
    ),
    ROUND(COALESCE(i.amount_paid, 0), 2),
    i.created_at,
    i.due_date,
    CASE
      WHEN i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
        AND public.is_collectable_invoice_status(i.status::text)
      THEN (CURRENT_DATE - i.due_date)::integer
      ELSE 0
    END
  FROM public.invoices i
  WHERE i.owner_id = p_owner_id
    AND COALESCE(i.receipt_only, false) = false
    AND public.is_soa_invoice_status(i.status::text)
    AND public.is_collectable_invoice_status(i.status::text)
    AND GREATEST(
      0,
      public.invoice_gross_total(i.total, i.vat_aed, i.service_type, i.notes)
        - ROUND(COALESCE(i.amount_paid, 0), 2)
    ) > 0
  ORDER BY i.due_date NULLS LAST, i.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_statement_of_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_statement_of_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_statement_of_account(uuid) TO service_role;

-- ── 5. Chronological owner ledger with running balance K ──

CREATE OR REPLACE FUNCTION public.get_ledger_statement(
  p_owner_id uuid,
  p_from timestamp with time zone,
  p_to timestamp with time zone
)
RETURNS TABLE (
  row_id text,
  created_at timestamp with time zone,
  amount numeric,
  balance_after numeric,
  is_opening_balance boolean,
  is_visible boolean,
  transaction_type text,
  invoice_id uuid,
  invoice_number character varying,
  service_type character varying,
  due_date date,
  payment_method public.payment_method,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH invoice_events AS (
    SELECT
      ('inv:' || i.id::text) AS row_id,
      COALESCE(i.became_outstanding_at, i.issue_date::timestamptz, i.created_at) AS event_at,
      1 AS sort_seq,
      -public.invoice_gross_total(i.total, i.vat_aed, i.service_type, i.notes) AS amount,
      true AS is_visible,
      'invoice'::text AS transaction_type,
      i.id AS invoice_id,
      i.invoice_number,
      i.service_type,
      i.due_date,
      NULL::public.payment_method AS payment_method,
      COALESCE(i.notes, '') AS notes
    FROM public.invoices i
    WHERE i.owner_id = p_owner_id
      AND COALESCE(i.receipt_only, false) = false
      AND public.is_soa_invoice_status(i.status::text)
      AND public.invoice_gross_total(i.total, i.vat_aed, i.service_type, i.notes) > 0
  ),
  payment_events AS (
    SELECT
      ('pay:' || ip.id::text) AS row_id,
      ip.created_at AS event_at,
      2 AS sort_seq,
      ROUND(ip.amount, 2) AS amount,
      (ip.payment_method <> 'wallet'::public.payment_method) AS is_visible,
      public.invoice_payment_tx_type(ip.payment_method) AS transaction_type,
      ip.invoice_id,
      i.invoice_number,
      i.service_type,
      i.due_date,
      ip.payment_method,
      COALESCE(ip.notes, '') AS notes
    FROM public.invoice_payments ip
    JOIN public.invoices i ON i.id = ip.invoice_id
    WHERE ip.owner_id = p_owner_id
      AND COALESCE(i.receipt_only, false) = false
  ),
  legacy_payment_events AS (
    SELECT
      ('legacy_pay:' || i.id::text) AS row_id,
      COALESCE(i.paid_at, i.updated_at, i.created_at) AS event_at,
      2 AS sort_seq,
      ROUND(COALESCE(i.amount_paid, 0), 2) AS amount,
      true AS is_visible,
      COALESCE(
        public.invoice_payment_tx_type(i.payment_method),
        'manual_topup'
      ) AS transaction_type,
      i.id AS invoice_id,
      i.invoice_number,
      i.service_type,
      i.due_date,
      i.payment_method,
      'Legacy settled amount'::text AS notes
    FROM public.invoices i
    WHERE i.owner_id = p_owner_id
      AND COALESCE(i.receipt_only, false) = false
      AND public.is_soa_invoice_status(i.status::text)
      AND ROUND(COALESCE(i.amount_paid, 0), 2) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_payments ip WHERE ip.invoice_id = i.id
      )
  ),
  wallet_events AS (
    SELECT
      ('wt:' || wt.id::text) AS row_id,
      wt.created_at AS event_at,
      3 AS sort_seq,
      ROUND(wt.amount, 2) AS amount,
      true AS is_visible,
      wt.transaction_type::text AS transaction_type,
      wt.invoice_id,
      i.invoice_number,
      COALESCE(wt.service_type, i.service_type) AS service_type,
      i.due_date,
      wt.payment_method,
      COALESCE(wt.notes, '') AS notes
    FROM public.wallet_transactions wt
    LEFT JOIN public.invoices i ON i.id = wt.invoice_id
    WHERE wt.owner_id = p_owner_id
      AND public.is_ledger_wallet_event(wt.invoice_id, wt.transaction_type)
  ),
  all_events AS (
    SELECT * FROM invoice_events
    UNION ALL
    SELECT * FROM payment_events
    UNION ALL
    SELECT * FROM legacy_payment_events
    UNION ALL
    SELECT * FROM wallet_events
  ),
  with_balance AS (
    SELECT
      ae.*,
      ROUND(
        SUM(ae.amount) OVER (
          ORDER BY ae.event_at ASC, ae.sort_seq ASC, ae.row_id ASC
          ROWS UNBOUNDED PRECEDING
        ),
        2
      ) AS balance_after
    FROM all_events ae
  ),
  opening_k AS (
    SELECT ROUND(
      COALESCE(
        (
          SELECT wb.balance_after
          FROM with_balance wb
          WHERE wb.event_at < p_from
          ORDER BY wb.event_at DESC, wb.sort_seq DESC, wb.row_id DESC
          LIMIT 1
        ),
        (
          SELECT SUM(ae.amount)
          FROM all_events ae
          WHERE ae.event_at < p_from
        ),
        0
      ),
      2
    ) AS k
  ),
  window_visible AS (
    SELECT wb.*
    FROM with_balance wb
    WHERE wb.is_visible
      AND wb.event_at >= p_from
      AND wb.event_at <= p_to
  )
  SELECT
    'opening'::text,
    p_from,
    0::numeric,
    ok.k,
    true,
    true,
    'opening_balance'::text,
    NULL::uuid,
    NULL::character varying,
    NULL::character varying,
    NULL::date,
    NULL::public.payment_method,
    'Opening balance'::text
  FROM opening_k ok
  WHERE ok.k <> 0
     OR EXISTS (SELECT 1 FROM window_visible)

  UNION ALL

  SELECT
    wv.row_id,
    wv.event_at,
    wv.amount,
    wv.balance_after,
    false,
    wv.is_visible,
    wv.transaction_type,
    wv.invoice_id,
    wv.invoice_number,
    wv.service_type,
    wv.due_date,
    wv.payment_method,
    wv.notes
  FROM window_visible wv

  ORDER BY 2 ASC, 1 ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ledger_statement(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ledger_statement(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ledger_statement(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

-- ── Verification (paste after apply) ──
-- SELECT proname FROM pg_proc
-- WHERE proname IN (
--   'invoice_gross_total',
--   'get_statement_of_account',
--   'get_ledger_statement',
--   'invoice_ledger_amount'
-- )
-- ORDER BY 1;
--
-- SELECT * FROM get_statement_of_account('<owner_uuid>'::uuid) LIMIT 5;
-- SELECT * FROM get_ledger_statement(
--   '<owner_uuid>'::uuid,
--   '2025-01-01 00:00:00+04'::timestamptz,
--   now()
-- ) LIMIT 20;
