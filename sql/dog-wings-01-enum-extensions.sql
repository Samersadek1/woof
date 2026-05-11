-- =============================================================================
-- STEP 1 OF 2 — Run this alone in Supabase SQL Editor, then run Commit / Run.
-- PostgreSQL requires new enum labels to be committed before they appear in
-- later statements ("New enum values must be committed before they can be used").
-- After this succeeds, run: sql/dog-wings-02-insert-rooms.sql
-- =============================================================================
-- Extends public.room_wing and public.room_type for dog boarding inventory.
-- IF NOT EXISTS requires PostgreSQL 15+ (Supabase default).

ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'bond_rooms';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'dluxe';
ALTER TYPE public.room_wing ADD VALUE IF NOT EXISTS 'standard_room';

ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'single_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'double_royal';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'park_lane';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'pall_mall';
ALTER TYPE public.room_type ADD VALUE IF NOT EXISTS 'kennels';
