-- Add wing enum value for PetExec import placeholders (must commit before seed migration).

ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'import_placeholder';
