-- One-time backfill: copy subtotal/total/discount_amount into their _aed counterparts
-- for any invoices where the _aed columns were left at 0 during creation.
-- Safe to run multiple times.

UPDATE invoices
SET subtotal_aed = subtotal,
    total_aed    = total,
    discount_aed = discount_amount
WHERE total_aed = 0 AND total > 0;
