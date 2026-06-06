-- Storage bucket for check-in / belongings item and overview photos.
-- Used by src/hooks/useBookingItems.ts (booking-item-photos).

INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-item-photos', 'booking-item-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$ BEGIN
  CREATE POLICY booking_item_photos_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'booking-item-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY booking_item_photos_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'booking-item-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY booking_item_photos_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'booking-item-photos')
    WITH CHECK (bucket_id = 'booking-item-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY booking_item_photos_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'booking-item-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verification (paste after applying):
-- SELECT id, name, public FROM storage.buckets WHERE name = 'booking-item-photos';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'booking_item_photos_%';
