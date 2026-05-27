-- Remove 30 Day Ticket bonus grants (extra daycare day + splash choice).
-- Revoke bonus credits already issued on live (non-legacy) purchases.

UPDATE package_definitions
SET description = '30 Full Daycare Days'
WHERE code = 'thirty_day_ticket';

DELETE FROM package_credit_grants
WHERE package_def_id = (SELECT id FROM package_definitions WHERE code = 'thirty_day_ticket')
  AND is_bonus = true;

UPDATE service_credits sc
SET status = 'revoked'
WHERE sc.is_bonus = true
  AND sc.status IN ('active', 'depleted')
  AND EXISTS (
    SELECT 1
    FROM purchase_groups pg
    LEFT JOIN invoices i ON i.id = pg.invoice_id
    WHERE pg.id = sc.purchase_group_id
      AND (i.notes IS NULL OR i.notes NOT LIKE 'Legacy daycare%')
  );

-- Verification
SELECT code, description FROM package_definitions WHERE code = 'thirty_day_ticket';

SELECT service_code, units, is_bonus, exclusive_group
FROM package_credit_grants pcg
JOIN package_definitions pd ON pd.id = pcg.package_def_id
WHERE pd.code = 'thirty_day_ticket'
ORDER BY sort_order;

SELECT COUNT(*) AS live_bonus_still_active
FROM service_credits sc
JOIN purchase_groups pg ON pg.id = sc.purchase_group_id
LEFT JOIN invoices i ON i.id = pg.invoice_id
WHERE sc.is_bonus = true
  AND sc.status = 'active'
  AND (i.notes IS NULL OR i.notes NOT LIKE 'Legacy daycare%');
