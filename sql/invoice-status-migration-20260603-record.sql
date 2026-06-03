-- Record + rollback reference for legacy invoice status relabelling (2026-06-03).
-- Applied via supabase/migrations/20260603120000_relabel_legacy_unpaid_invoice_statuses.sql
--
-- Summary at time of migration:
--   64 finalised unpaid → outstanding  (AED 8,502.00)
--    4 issued unpaid     → outstanding  (AED 2,822.40)
--   68 total                          (AED 11,324.40)
--
-- Rollback (only safe before post-migration payments/voids on affected rows):
--   UPDATE invoices i
--   SET status = b.old_status::invoice_status
--   FROM invoice_status_migration_20260603 b
--   WHERE i.id = b.invoice_id;

SELECT
  b.invoice_number,
  o.first_name,
  o.last_name,
  b.old_status,
  b.new_status,
  b.total,
  b.amount_paid,
  b.balance_due,
  b.migrated_at
FROM invoice_status_migration_20260603 b
JOIN owners o ON o.id = b.owner_id
ORDER BY o.last_name, o.first_name, b.invoice_number;
