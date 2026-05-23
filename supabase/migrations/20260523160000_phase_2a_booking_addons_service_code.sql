BEGIN;

ALTER TABLE public.booking_addons
  ADD COLUMN IF NOT EXISTS service_code service_code;

CREATE INDEX IF NOT EXISTS idx_booking_addons_service_code
  ON public.booking_addons (service_code);

COMMIT;
