-- Legacy Woof boarding import schema + atomic import RPC

DO $$
DECLARE
  v_status_type text;
  v_has_active boolean;
  v_has_deceased boolean;
BEGIN
  -- Conflict guards: stop if existing columns have unexpected types.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'owners'
      AND column_name = 'source_external_id' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'owners.source_external_id exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'owners'
      AND column_name = 'is_elite' AND data_type <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'owners.is_elite exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'owners'
      AND column_name = 'notes' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'owners.notes exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pets'
      AND column_name = 'source_external_id' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'pets.source_external_id exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pets'
      AND column_name = 'behaviour_notes' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'pets.behaviour_notes exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pets'
      AND column_name = 'feeding_notes' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'pets.feeding_notes exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pets'
      AND column_name = 'medication_notes' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'pets.medication_notes exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pets'
      AND column_name = 'status' AND data_type NOT IN ('text', 'USER-DEFINED')
  ) THEN
    RAISE EXCEPTION 'pets.status exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rooms'
      AND column_name = 'source_external_id' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'rooms.source_external_id exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rooms'
      AND column_name = 'name' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'rooms.name exists with conflicting type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings'
      AND column_name = 'source_external_id' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'bookings.source_external_id exists with conflicting type';
  END IF;

  -- If pets.status already exists as enum, ensure active/deceased are valid.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pets' AND column_name = 'status'
      AND data_type = 'USER-DEFINED'
  ) THEN
    SELECT c.udt_name
    INTO v_status_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'pets' AND c.column_name = 'status';

    SELECT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = v_status_type AND e.enumlabel = 'active'
    )
    INTO v_has_active;

    SELECT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = v_status_type AND e.enumlabel = 'deceased'
    )
    INTO v_has_deceased;

    IF NOT v_has_active THEN
      EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', v_status_type, 'active');
    END IF;

    IF NOT v_has_deceased THEN
      EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', v_status_type, 'deceased');
    END IF;
  END IF;
END
$$;

ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS is_elite boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS behaviour_notes text,
  ADD COLUMN IF NOT EXISTS feeding_notes text,
  ADD COLUMN IF NOT EXISTS medication_notes text,
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS name text;

UPDATE public.rooms
SET name = COALESCE(name, display_name, room_number)
WHERE name IS NULL;

ALTER TABLE public.rooms
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.rooms
  ALTER COLUMN name SET DEFAULT '';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source_external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_owners_source_external_id_full
  ON public.owners (source_external_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pets_source_external_id_full
  ON public.pets (source_external_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rooms_source_external_id_full
  ON public.rooms (source_external_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_source_external_id_full
  ON public.bookings (source_external_id);

CREATE TABLE IF NOT EXISTS public.booking_room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_bra_booking ON public.booking_room_assignments (booking_id);
CREATE INDEX IF NOT EXISTS idx_bra_dates ON public.booking_room_assignments (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_bra_room ON public.booking_room_assignments (room_id);

ALTER TABLE public.booking_room_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_room_assignments'
      AND policyname = 'bra_authenticated'
  ) THEN
    CREATE POLICY bra_authenticated
      ON public.booking_room_assignments
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.do_legacy_import_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  batch jsonb;
  row_count integer;
  rooms_affected integer := 0;
  owners_affected integer := 0;
  pets_affected integer := 0;
  bookings_affected integer := 0;
  booking_pets_affected integer := 0;
  bra_affected integer := 0;
BEGIN
  FOR batch IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'rooms_batches', '[]'::jsonb))
  LOOP
    WITH room_data AS (
      SELECT *
      FROM jsonb_to_recordset(batch) AS x(
        source_external_id text,
        name text,
        is_active boolean
      )
    )
    INSERT INTO public.rooms (
      name,
      display_name,
      room_number,
      wing,
      room_type,
      capacity_type,
      max_pets,
      source_external_id,
      is_active
    )
    SELECT
      rd.name,
      rd.name,
      rd.name,
      'import_placeholder'::public.room_wing,
      'kennels'::public.room_type,
      'single'::public.capacity_type,
      1,
      rd.source_external_id,
      COALESCE(rd.is_active, true)
    FROM room_data rd
    ON CONFLICT (source_external_id) DO UPDATE
      SET name = EXCLUDED.name,
          display_name = EXCLUDED.display_name,
          room_number = EXCLUDED.room_number,
          wing = EXCLUDED.wing,
          room_type = EXCLUDED.room_type,
          capacity_type = EXCLUDED.capacity_type,
          max_pets = EXCLUDED.max_pets,
          is_active = EXCLUDED.is_active;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    rooms_affected := rooms_affected + row_count;
  END LOOP;

  FOR batch IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'owners_batches', '[]'::jsonb))
  LOOP
    WITH owner_data AS (
      SELECT *
      FROM jsonb_to_recordset(batch) AS x(
        source_external_id text,
        first_name text,
        last_name text,
        phone text,
        email text,
        notes text,
        is_elite boolean
      )
    )
    INSERT INTO public.owners (
      first_name, last_name, phone, email, notes, is_elite, source_external_id
    )
    SELECT
      od.first_name,
      od.last_name,
      od.phone,
      od.email,
      od.notes,
      COALESCE(od.is_elite, false),
      od.source_external_id
    FROM owner_data od
    ON CONFLICT (source_external_id) DO UPDATE
      SET first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          phone = COALESCE(EXCLUDED.phone, owners.phone),
          email = COALESCE(EXCLUDED.email, owners.email),
          notes = EXCLUDED.notes,
          is_elite = EXCLUDED.is_elite;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    owners_affected := owners_affected + row_count;
  END LOOP;

  FOR batch IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'pets_batches', '[]'::jsonb))
  LOOP
    WITH pet_data AS (
      SELECT *
      FROM jsonb_to_recordset(batch) AS x(
        source_external_id text,
        owner_source_external_id text,
        name text,
        status text,
        species text,
        behaviour_notes text,
        feeding_notes text,
        medication_notes text
      )
    )
    INSERT INTO public.pets (
      owner_id,
      name,
      status,
      species,
      assessment_status,
      behaviour_notes,
      feeding_notes,
      medication_notes,
      source_external_id
    )
    SELECT
      o.id,
      pd.name,
      pd.status,
      pd.species::public.species,
      'passed'::public.assessment_status,
      pd.behaviour_notes,
      pd.feeding_notes,
      pd.medication_notes,
      pd.source_external_id
    FROM pet_data pd
    JOIN public.owners o ON o.source_external_id = pd.owner_source_external_id
    ON CONFLICT (source_external_id) DO UPDATE
      SET name = EXCLUDED.name,
          status = EXCLUDED.status,
          assessment_status = 'passed'::public.assessment_status,
          behaviour_notes = EXCLUDED.behaviour_notes,
          feeding_notes = EXCLUDED.feeding_notes,
          medication_notes = EXCLUDED.medication_notes;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    pets_affected := pets_affected + row_count;
  END LOOP;

  FOR batch IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'bookings_batches', '[]'::jsonb))
  LOOP
    WITH booking_data AS (
      SELECT *
      FROM jsonb_to_recordset(batch) AS x(
        source_external_id text,
        owner_source_external_id text,
        check_in_date date,
        check_out_date date,
        notes text
      )
    )
    INSERT INTO public.bookings (
      owner_id,
      check_in_date,
      check_out_date,
      booking_type,
      status,
      notes,
      source_external_id
    )
    SELECT
      o.id,
      bd.check_in_date,
      bd.check_out_date,
      'boarding'::public.booking_type,
      'confirmed'::public.booking_status,
      bd.notes,
      bd.source_external_id
    FROM booking_data bd
    JOIN public.owners o ON o.source_external_id = bd.owner_source_external_id
    ON CONFLICT (source_external_id) DO NOTHING;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    bookings_affected := bookings_affected + row_count;
  END LOOP;

  FOR batch IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'booking_pets_batches', '[]'::jsonb))
  LOOP
    WITH booking_pet_data AS (
      SELECT *
      FROM jsonb_to_recordset(batch) AS x(
        booking_source_external_id text,
        pet_source_external_id text
      )
    )
    INSERT INTO public.booking_pets (booking_id, pet_id)
    SELECT b.id, p.id
    FROM booking_pet_data bpd
    JOIN public.bookings b ON b.source_external_id = bpd.booking_source_external_id
    JOIN public.pets p ON p.source_external_id = bpd.pet_source_external_id
    ON CONFLICT (booking_id, pet_id) DO NOTHING;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    booking_pets_affected := booking_pets_affected + row_count;
  END LOOP;

  FOR batch IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'booking_room_assignments_batches', '[]'::jsonb))
  LOOP
    WITH bra_data AS (
      SELECT *
      FROM jsonb_to_recordset(batch) AS x(
        booking_source_external_id text,
        room_source_external_id text,
        start_date date,
        end_date date
      )
    )
    INSERT INTO public.booking_room_assignments (booking_id, room_id, start_date, end_date)
    SELECT
      b.id,
      r.id,
      brd.start_date,
      brd.end_date
    FROM bra_data brd
    JOIN public.bookings b ON b.source_external_id = brd.booking_source_external_id
    JOIN public.rooms r ON r.source_external_id = brd.room_source_external_id;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    bra_affected := bra_affected + row_count;
  END LOOP;

  RETURN jsonb_build_object(
    'rooms_affected', rooms_affected,
    'owners_affected', owners_affected,
    'pets_affected', pets_affected,
    'bookings_affected', bookings_affected,
    'booking_pets_affected', booking_pets_affected,
    'booking_room_assignments_affected', bra_affected
  );
END;
$$;

ALTER FUNCTION public.do_legacy_import_atomic(jsonb) SET search_path = public;
