-- Service/package list prices: three decimal places (was numeric(10,2)).

BEGIN;

ALTER TABLE service_rates
  ALTER COLUMN amount_aed TYPE numeric(10, 3);

ALTER TABLE package_pricing
  ALTER COLUMN amount_aed TYPE numeric(10, 3);

SELECT
  (SELECT numeric_precision FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'service_rates' AND column_name = 'amount_aed') AS service_rates_precision,
  (SELECT numeric_scale FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'service_rates' AND column_name = 'amount_aed') AS service_rates_scale,
  (SELECT numeric_scale FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'package_pricing' AND column_name = 'amount_aed') AS package_pricing_scale;

COMMIT;
