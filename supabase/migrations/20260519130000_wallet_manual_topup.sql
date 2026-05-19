-- Manual wallet top-up from customer profile (staff-entered amount + note).
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'manual_topup';
