BEGIN;

-- PKG-84262-84380 (60 total / 45 used, 2 pets)
UPDATE service_credits SET units_total = 30, units_consumed = 23 WHERE id = '5729a11a-22c7-44a2-9e51-f4cf0422e9aa'::uuid AND (units_total IS DISTINCT FROM 30 OR units_consumed IS DISTINCT FROM 23);
UPDATE service_credits SET units_total = 30, units_consumed = 22 WHERE id = 'e8e20dbd-bf7b-440f-adfb-4a2801b46e76'::uuid AND (units_total IS DISTINCT FROM 30 OR units_consumed IS DISTINCT FROM 22);

-- PKG-Invoice-Lotus-Meimei-Rocky-Kronfol unpaid xlsx (90 total / 0 used, 3 pets)
UPDATE service_credits SET units_total = 30, units_consumed = 0 WHERE id = '7c29d7af-59b1-4f11-90ef-cca31b1fcf31'::uuid AND (units_total IS DISTINCT FROM 30 OR units_consumed IS DISTINCT FROM 0);
UPDATE service_credits SET units_total = 30, units_consumed = 0 WHERE id = 'f7b407ea-84c2-40f3-9ddd-2f223fa0848d'::uuid AND (units_total IS DISTINCT FROM 30 OR units_consumed IS DISTINCT FROM 0);
UPDATE service_credits SET units_total = 30, units_consumed = 0 WHERE id = 'b00c1546-6046-4bfa-b1aa-87a8d56cf053'::uuid AND (units_total IS DISTINCT FROM 30 OR units_consumed IS DISTINCT FROM 0);

COMMIT;
