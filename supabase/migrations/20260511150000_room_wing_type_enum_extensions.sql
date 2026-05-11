-- Enum extensions only — must run before inserts (cannot use new labels in same txn).
-- Mirrors sql/dog-wings-01-enum-extensions.sql

ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'bond_rooms';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'dluxe';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'standard_room';

ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'single_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'double_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'park_lane';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'pall_mall';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'kennels';
