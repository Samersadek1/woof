-- Optional: align `addon_rates` display amounts with canonical `pricing` keys
-- (app invoices already prefer `pricing`; this keeps Billing → Pricing tab in sync.)
-- Run in Supabase SQL editor after updating the rate card.

UPDATE public.addon_rates AS ar
SET
  price_aed = p.amount_aed,
  updated_at = NOW()
FROM public.pricing AS p
WHERE p.key = ar.addon_type::text;

-- Map enum labels that differ from pricing keys:
UPDATE public.addon_rates AS ar
SET price_aed = p.amount_aed, updated_at = NOW()
FROM public.pricing AS p
WHERE ar.addon_type::text = 'grooming_full' AND p.key = 'grooming_full_groom';

UPDATE public.addon_rates AS ar
SET price_aed = p.amount_aed, updated_at = NOW()
FROM public.pricing AS p
WHERE ar.addon_type::text = 'grooming_bath' AND p.key = 'grooming_full_bath';
