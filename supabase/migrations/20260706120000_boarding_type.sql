-- Boarding type schema (enums + column). Enum value must commit before use in a follow-up migration.

DO $$ BEGIN
  CREATE TYPE public.boarding_type AS ENUM ('boarding_only', 'board_and_train');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS boarding_type public.boarding_type NOT NULL DEFAULT 'boarding_only';

DO $$ BEGIN
  ALTER TYPE public.service_code ADD VALUE 'board_and_train_night';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
