-- Relabel legacy unpaid invoices: finalised/issued → outstanding (Phase 2 status model).
-- finalised = fully settled; collectable debt = outstanding | partially_paid | overdue only.
-- Rollback: UPDATE invoices i SET status = b.old_status FROM invoice_status_migration_20260603 b WHERE i.id = b.invoice_id;

CREATE TABLE IF NOT EXISTS invoice_status_migration_20260603 (
  invoice_id uuid PRIMARY KEY,
  invoice_number text,
  owner_id uuid,
  old_status text NOT NULL,
  new_status text NOT NULL DEFAULT 'outstanding',
  total numeric,
  amount_paid numeric,
  balance_due numeric,
  migrated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO invoice_status_migration_20260603 (
  invoice_id,
  invoice_number,
  owner_id,
  old_status,
  total,
  amount_paid,
  balance_due
)
SELECT
  i.id,
  i.invoice_number,
  i.owner_id,
  i.status::text,
  i.total,
  i.amount_paid,
  GREATEST(i.total - COALESCE(i.amount_paid, 0), 0)
FROM invoices i
WHERE COALESCE(i.receipt_only, false) = false
  AND (
    (i.status = 'finalised' AND COALESCE(i.amount_paid, 0) < i.total)
    OR (i.status = 'issued' AND COALESCE(i.amount_paid, 0) < i.total)
  )
ON CONFLICT (invoice_id) DO NOTHING;

UPDATE invoices i
SET status = 'outstanding'
FROM invoice_status_migration_20260603 b
WHERE i.id = b.invoice_id
  AND i.status IN ('finalised', 'issued');

-- Verification (expect 68 rows in backup, 0 remaining legacy unpaid)
SELECT
  (SELECT count(*) FROM invoice_status_migration_20260603) AS backup_rows,
  (SELECT count(*)
   FROM invoices
   WHERE COALESCE(receipt_only, false) = false
     AND status IN ('finalised', 'issued')
     AND COALESCE(amount_paid, 0) < total) AS remaining_legacy_unpaid,
  (SELECT count(*)
   FROM invoices
   WHERE COALESCE(receipt_only, false) = false
     AND status = 'outstanding') AS outstanding_count;
