-- Boarding room segments: integrity, cross-booking conflict guard, backfill, move RPC.
-- Uses existing public.booking_room_assignments as the segment table.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Repair overlapping segments on the same booking (import edge cases) ───────
WITH ranked AS (
  SELECT
    id,
    booking_id,
    start_date,
    end_date,
    LEAD(start_date) OVER (
      PARTITION BY booking_id
      ORDER BY start_date, end_date, id
    ) AS next_start
  FROM public.booking_room_assignments
),
to_fix AS (
  SELECT id, (next_start - 1) AS new_end
  FROM ranked
  WHERE next_start IS NOT NULL
    AND end_date >= next_start
)
UPDATE public.booking_room_assignments bra
SET end_date = to_fix.new_end
FROM to_fix
WHERE bra.id = to_fix.id
  AND to_fix.new_end >= bra.start_date;

DELETE FROM public.booking_room_assignments
WHERE end_date < start_date;

-- ── Per-booking segment overlap guard (trigger — legacy import rows may overlap) ─
CREATE OR REPLACE FUNCTION public.enforce_bra_same_booking_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.booking_room_assignments bra
    WHERE bra.booking_id = NEW.booking_id
      AND bra.id IS DISTINCT FROM NEW.id
      AND daterange(bra.start_date, bra.end_date, '[]')
          && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'ROOM_OVERLAP_CONFLICT: segment dates overlap another segment on this booking'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bra_same_booking_no_overlap ON public.booking_room_assignments;
CREATE TRIGGER trg_enforce_bra_same_booking_no_overlap
  BEFORE INSERT OR UPDATE OF booking_id, start_date, end_date
  ON public.booking_room_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_bra_same_booking_no_overlap();

-- ── Cross-booking room conflict on segment changes ───────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_boarding_assignment_room_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_booking RECORD;
  v_conflict RECORD;
BEGIN
  SELECT b.id, b.owner_id, b.status, COALESCE(b.booking_type, 'boarding') AS booking_type
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  IF NOT FOUND OR v_booking.booking_type <> 'boarding' OR v_booking.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF public.is_import_placeholder_room_id(NEW.room_id) THEN
    RETURN NEW;
  END IF;

  SELECT
    bra.id,
    b.id AS booking_id,
    b.owner_id
  INTO v_conflict
  FROM public.booking_room_assignments bra
  JOIN public.bookings b ON b.id = bra.booking_id
  WHERE bra.room_id = NEW.room_id
    AND bra.id IS DISTINCT FROM NEW.id
    AND b.status <> 'cancelled'
    AND COALESCE(b.booking_type, 'boarding') = 'boarding'
    AND b.owner_id <> v_booking.owner_id
    AND daterange(bra.start_date, bra.end_date, '[]')
        && daterange(NEW.start_date, NEW.end_date, '[]')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_OVERLAP_CONFLICT: room % is already assigned for overlapping dates', NEW.room_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_boarding_assignment_room_overlap ON public.booking_room_assignments;
CREATE TRIGGER trg_enforce_boarding_assignment_room_overlap
  BEFORE INSERT OR UPDATE OF booking_id, room_id, start_date, end_date
  ON public.booking_room_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_boarding_assignment_room_overlap();

-- Align bookings-level overlap errors with app token
CREATE OR REPLACE FUNCTION public.enforce_boarding_room_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_conflict RECORD;
BEGIN
  IF COALESCE(NEW.booking_type, 'boarding') <> 'boarding' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.room_id IS NULL OR NEW.owner_id IS NULL OR NEW.check_in_date IS NULL OR NEW.check_out_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_import_placeholder_room_id(NEW.room_id) THEN
    RETURN NEW;
  END IF;

  SELECT b.id INTO v_conflict
  FROM public.bookings b
  WHERE b.room_id = NEW.room_id
    AND (NEW.id IS NULL OR b.id <> NEW.id)
    AND b.status <> 'cancelled'
    AND COALESCE(b.booking_type, 'boarding') = 'boarding'
    AND b.owner_id <> NEW.owner_id
    AND daterange(b.check_in_date, b.check_out_date, '[)')
        && daterange(NEW.check_in_date, NEW.check_out_date, '[)')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_OVERLAP_CONFLICT: room % is already booked for those dates', NEW.room_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Also block against active assignment segments from other owners
  SELECT bra.id INTO v_conflict
  FROM public.booking_room_assignments bra
  JOIN public.bookings b ON b.id = bra.booking_id
  WHERE bra.room_id = NEW.room_id
    AND b.id IS DISTINCT FROM NEW.id
    AND b.status <> 'cancelled'
    AND COALESCE(b.booking_type, 'boarding') = 'boarding'
    AND b.owner_id <> NEW.owner_id
    AND daterange(bra.start_date, bra.end_date, '[]')
        && daterange(NEW.check_in_date, NEW.check_out_date - 1, '[]')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'ROOM_OVERLAP_CONFLICT: room % is already assigned for those dates', NEW.room_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Backfill one segment per boarding booking missing segments ───────────────
INSERT INTO public.booking_room_assignments (booking_id, room_id, start_date, end_date)
SELECT
  b.id,
  b.room_id,
  b.check_in_date,
  GREATEST(b.check_in_date, b.check_out_date - 1)
FROM public.bookings b
WHERE COALESCE(b.booking_type, 'boarding') = 'boarding'
  AND b.status <> 'cancelled'
  AND b.room_id IS NOT NULL
  AND b.check_out_date > b.check_in_date
  AND NOT EXISTS (
    SELECT 1
    FROM public.booking_room_assignments bra
    WHERE bra.booking_id = b.id
  );

-- ── move_boarding_room: split segment at effective date, insert replacement ───
CREATE OR REPLACE FUNCTION public.move_boarding_room(
  p_booking_id uuid,
  p_effective_date date,
  p_target_room_id uuid,
  p_reason text DEFAULT NULL,
  p_moved_by text DEFAULT NULL,
  p_override_do_not_move boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_last_night date;
  v_seg public.booking_room_assignments%ROWTYPE;
  v_prev_end date;
  v_note_line text;
  v_pointer_date date;
  v_pointer_room uuid;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF COALESCE(v_booking.booking_type, 'boarding') <> 'boarding' THEN
    RAISE EXCEPTION 'Only boarding bookings support room moves';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot move room on a cancelled booking';
  END IF;

  IF v_booking.check_out_date <= v_booking.check_in_date THEN
    RAISE EXCEPTION 'Invalid booking date range';
  END IF;

  v_last_night := v_booking.check_out_date - 1;

  IF p_effective_date < v_booking.check_in_date OR p_effective_date > v_last_night THEN
    RAISE EXCEPTION 'Effective date must be within the stay (check-in through last night)';
  END IF;

  IF v_booking.do_not_move AND NOT COALESCE(p_override_do_not_move, false) THEN
    RAISE EXCEPTION 'DO_NOT_MOVE: booking is flagged do not move';
  END IF;

  IF public.is_import_placeholder_room_id(p_target_room_id) THEN
    RAISE EXCEPTION 'Target room must be a real kennel, not an import placeholder';
  END IF;

  SELECT * INTO v_seg
  FROM public.booking_room_assignments bra
  WHERE bra.booking_id = p_booking_id
    AND bra.start_date <= p_effective_date
    AND bra.end_date >= p_effective_date
  ORDER BY bra.start_date
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    IF v_booking.room_id IS NULL THEN
      RAISE EXCEPTION 'No room segment covers the effective date';
    END IF;

    INSERT INTO public.booking_room_assignments (booking_id, room_id, start_date, end_date)
    VALUES (p_booking_id, v_booking.room_id, v_booking.check_in_date, v_last_night)
  RETURNING * INTO v_seg;
  END IF;

  IF v_seg.room_id = p_target_room_id
     AND v_seg.start_date = p_effective_date
     AND v_seg.end_date = v_last_night THEN
    RETURN jsonb_build_object('booking_id', p_booking_id, 'noop', true);
  END IF;

  IF p_effective_date > v_seg.start_date THEN
    v_prev_end := p_effective_date - 1;
    UPDATE public.booking_room_assignments
    SET end_date = v_prev_end
    WHERE id = v_seg.id;
  ELSE
    DELETE FROM public.booking_room_assignments WHERE id = v_seg.id;
  END IF;

  INSERT INTO public.booking_room_assignments (booking_id, room_id, start_date, end_date)
  VALUES (p_booking_id, p_target_room_id, p_effective_date, v_seg.end_date);

  v_pointer_date := LEAST(GREATEST(CURRENT_DATE, v_booking.check_in_date), v_last_night);

  SELECT bra.room_id INTO v_pointer_room
  FROM public.booking_room_assignments bra
  WHERE bra.booking_id = p_booking_id
    AND bra.start_date <= v_pointer_date
    AND bra.end_date >= v_pointer_date
  ORDER BY bra.start_date DESC
  LIMIT 1;

  IF v_pointer_room IS NOT NULL THEN
    UPDATE public.bookings SET room_id = v_pointer_room, updated_at = now() WHERE id = p_booking_id;
  END IF;

  IF COALESCE(trim(p_reason), '') <> '' OR COALESCE(trim(p_moved_by), '') <> '' THEN
    v_note_line := format(
      '[Room move %s → %s on %s]%s%s',
      (SELECT COALESCE(r.room_number, r.display_name, '?') FROM public.rooms r WHERE r.id = v_seg.room_id),
      (SELECT COALESCE(r.room_number, r.display_name, '?') FROM public.rooms r WHERE r.id = p_target_room_id),
      p_effective_date,
      CASE WHEN COALESCE(trim(p_moved_by), '') <> '' THEN ' By: ' || trim(p_moved_by) ELSE '' END,
      CASE WHEN COALESCE(trim(p_reason), '') <> '' THEN '. Reason: ' || trim(p_reason) ELSE '' END
    );
    UPDATE public.bookings
    SET notes = trim(both E'\n' from concat_ws(E'\n', NULLIF(trim(COALESCE(notes, '')), ''), v_note_line))
    WHERE id = p_booking_id;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'effective_date', p_effective_date,
    'target_room_id', p_target_room_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.move_boarding_room(uuid, date, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_boarding_room(uuid, date, uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_boarding_room(uuid, date, uuid, text, text, boolean) TO service_role;

COMMIT;

-- Verification (paste in Supabase SQL editor):
-- SELECT proname FROM pg_proc WHERE proname IN ('move_boarding_room', 'enforce_bra_same_booking_no_overlap');
-- SELECT COUNT(*) AS backfilled FROM booking_room_assignments bra
--   JOIN bookings b ON b.id = bra.booking_id
--   WHERE b.booking_type = 'boarding' AND bra.start_date = b.check_in_date;
