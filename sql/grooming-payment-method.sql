-- Intended payment method when booking grooming (cash / card / wallet).
-- Run in Supabase SQL editor or CLI after deploying app changes.

ALTER TABLE public.grooming_appointments
  ADD COLUMN IF NOT EXISTS payment_method text NULL;

COMMENT ON COLUMN public.grooming_appointments.payment_method IS
  'Intended payment at checkout: cash, card, or wallet.';
