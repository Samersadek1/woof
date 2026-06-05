-- Per-owner overdue collectable balance for payments KPI totals.

DROP FUNCTION IF EXISTS public.get_owners_with_collectable_debt();

CREATE OR REPLACE FUNCTION public.get_owners_with_collectable_debt()
RETURNS TABLE (
  owner_id          uuid,
  owner_name        text,
  phone             text,
  due_now           numeric,
  overdue_now       numeric,
  invoice_count     integer,
  oldest_due_date   date,
  max_days_overdue  integer,
  in_progress       numeric,
  total_balance     numeric,
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
  collectable_agg AS (
    SELECT
      c.owner_id,
      SUM(c.balance) AS due_now,
      SUM(
        CASE
          WHEN c.due_date IS NOT NULL AND c.due_date < current_date THEN c.balance
          ELSE 0
        END
      ) AS overdue_now,
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
  ),
  owner_ids AS (
    SELECT owner_id FROM collectable_agg
    UNION
    SELECT owner_id FROM drafts
  )
  SELECT
    oi.owner_id,
    TRIM(COALESCE(o.first_name, '') || ' ' || COALESCE(o.last_name, '')) AS owner_name,
    o.phone,
    COALESCE(a.due_now, 0) AS due_now,
    COALESCE(a.overdue_now, 0) AS overdue_now,
    COALESCE(a.invoice_count, 0)::integer AS invoice_count,
    a.oldest_due_date,
    COALESCE(a.max_days_overdue, 0)::integer AS max_days_overdue,
    COALESCE(d.in_progress, 0) AS in_progress,
    COALESCE(a.due_now, 0) + COALESCE(d.in_progress, 0) AS total_balance,
    COALESCE(o.wallet_balance, 0) AS wallet_credit,
    r.last_reminder_at
  FROM owner_ids oi
  JOIN owners o ON o.id = oi.owner_id
  LEFT JOIN collectable_agg a ON a.owner_id = oi.owner_id
  LEFT JOIN drafts d ON d.owner_id = oi.owner_id
  LEFT JOIN reminders r ON r.owner_id = oi.owner_id
  ORDER BY total_balance DESC, max_days_overdue DESC, due_now DESC;
$$;

-- Verification:
-- SELECT SUM(due_now), SUM(overdue_now), SUM(in_progress)
-- FROM get_owners_with_collectable_debt();
