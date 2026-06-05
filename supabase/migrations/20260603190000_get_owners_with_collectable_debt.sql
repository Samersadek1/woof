-- Lightweight per-owner collectable debt aggregate for payments triage list.

CREATE OR REPLACE FUNCTION public.get_owners_with_collectable_debt()
RETURNS TABLE (
  owner_id          uuid,
  owner_name        text,
  phone             text,
  due_now           numeric,
  invoice_count     integer,
  oldest_due_date   date,
  max_days_overdue  integer,
  in_progress       numeric,
  wallet_credit     numeric,
  last_reminder_at  timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH collectable AS (
    SELECT
      i.owner_id,
      (i.total - i.amount_paid) AS balance,
      i.due_date
    FROM invoices i
    WHERE i.receipt_only = false
      AND i.status IN ('outstanding', 'overdue', 'partially_paid')
      AND (i.total - i.amount_paid) > 0
  ),
  drafts AS (
    SELECT i.owner_id, SUM(i.total - i.amount_paid) AS in_progress
    FROM invoices i
    WHERE i.receipt_only = false
      AND i.status = 'draft'
      AND (i.total - i.amount_paid) > 0
    GROUP BY i.owner_id
  ),
  reminders AS (
    SELECT pr.owner_id, MAX(pr.sent_at) AS last_reminder_at
    FROM payment_reminders pr
    GROUP BY pr.owner_id
  ),
  agg AS (
    SELECT
      c.owner_id,
      SUM(c.balance) AS due_now,
      COUNT(*) AS invoice_count,
      MIN(c.due_date) AS oldest_due_date,
      MAX(
        CASE
          WHEN c.due_date < current_date THEN current_date - c.due_date
          ELSE 0
        END
      ) AS max_days_overdue
    FROM collectable c
    GROUP BY c.owner_id
  )
  SELECT
    a.owner_id,
    TRIM(COALESCE(o.first_name, '') || ' ' || COALESCE(o.last_name, '')) AS owner_name,
    o.phone,
    a.due_now,
    a.invoice_count::integer,
    a.oldest_due_date,
    a.max_days_overdue::integer,
    COALESCE(d.in_progress, 0) AS in_progress,
    COALESCE(o.wallet_balance, 0) AS wallet_credit,
    r.last_reminder_at
  FROM agg a
  JOIN owners o ON o.id = a.owner_id
  LEFT JOIN drafts d ON d.owner_id = a.owner_id
  LEFT JOIN reminders r ON r.owner_id = a.owner_id
  ORDER BY a.max_days_overdue DESC, a.due_now DESC;
$$;

-- Verification (paste into Supabase SQL editor):
-- SELECT COUNT(*), SUM(due_now) FROM get_owners_with_collectable_debt();
-- SELECT SUM(total - amount_paid) FROM invoices
-- WHERE receipt_only = false
--   AND status IN ('outstanding','overdue','partially_paid')
--   AND (total - amount_paid) > 0;
