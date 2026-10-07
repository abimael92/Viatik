-- Live authorization regression test for migrations 81, 82, and 83.
-- Run only against the already-migrated local database with:
--   docker exec -i supabase_db_viatik psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/trip-media-authorization.test.sql
-- pgtap is not installed in the local image, so this uses transaction-scoped
-- SQL assertions under the real authenticated/anon database roles instead.
-- Every fixture, assertion write, and test-only setting is rolled back below.

BEGIN;

-- Stop rather than collide with any existing local user/data. Nothing is
-- deleted, truncated, or overwritten by this script.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id IN (
      'a1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000003',
      'a1000000-0000-4000-8000-000000000004',
      'a1000000-0000-4000-8000-000000000005',
      'a1000000-0000-4000-8000-000000000006',
      'a1000000-0000-4000-8000-000000000007'
    )
    OR email IN (
      'media-rls-owner@example.invalid',
      'media-rls-viewer@example.invalid',
      'media-rls-editor@example.invalid',
      'media-rls-removed@example.invalid',
      'media-rls-deleted@example.invalid',
      'media-rls-reactivate@example.invalid',
      'media-rls-outsider@example.invalid'
    )
  ) THEN
    RAISE EXCEPTION 'Trip-media RLS test fixture user collision; no data changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trips WHERE id = 'b2000000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.trip_media WHERE id BETWEEN 'c3000000-0000-4000-8000-000000000001'::uuid AND 'c3000000-0000-4000-8000-000000000013'::uuid)
    OR EXISTS (SELECT 1 FROM public.trip_invitations WHERE id BETWEEN 'e5000000-0000-4000-8000-000000000001'::uuid AND 'e5000000-0000-4000-8000-000000000003'::uuid)
    OR EXISTS (SELECT 1 FROM storage.objects WHERE id BETWEEN 'd4000000-0000-4000-8000-000000000001'::uuid AND 'd4000000-0000-4000-8000-000000000013'::uuid)
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'trip-media' AND name LIKE 'b2000000-0000-4000-8000-000000000001/%')
  THEN
    RAISE EXCEPTION 'Trip-media RLS test fixture collision; no data changed';
  END IF;
END;
$$;

-- Seven isolated fixed users; profile rows are created by the normal auth hook.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'media-rls-owner@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Owner"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'media-rls-viewer@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Viewer"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'media-rls-editor@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Editor"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'media-rls-removed@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Removed"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'media-rls-deleted@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Deleted"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'media-rls-reactivate@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Reactivate"}', now(), now()),
  ('a1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'media-rls-outsider@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Outsider"}', now(), now());

INSERT INTO public.trips (id, owner_id, name, destination)
VALUES ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'RLS media test trip', 'Local fixture');

INSERT INTO public.trip_members (trip_id, user_id, role, invited_by, removed_at, removed_by, deleted_at, deleted_by)
VALUES
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', 'a1000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'viewer', 'a1000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'editor', 'a1000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'viewer', 'a1000000-0000-4000-8000-000000000001', now(), 'a1000000-0000-4000-8000-000000000001', NULL, NULL),
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'viewer', 'a1000000-0000-4000-8000-000000000001', NULL, NULL, now(), 'a1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'editor', 'a1000000-0000-4000-8000-000000000001', now(), 'a1000000-0000-4000-8000-000000000001', now(), 'a1000000-0000-4000-8000-000000000001');

-- Set the fixture actor so the real created_by/invitation triggers run normally.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"media-rls-owner@example.invalid"}', true);

INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata, user_metadata)
VALUES
  ('d4000000-0000-4000-8000-000000000001', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":512}', '{}'),
  ('d4000000-0000-4000-8000-000000000002', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000004.jpg', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":512}', '{}'),
  ('d4000000-0000-4000-8000-000000000003', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000005.png', 'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', '{"mimetype":"image/png","size":512}', '{}'),
  ('d4000000-0000-4000-8000-000000000004', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000006.jpg', 'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":512}', '{}'),
  ('d4000000-0000-4000-8000-000000000005', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000007.jpg', 'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":10485761}', '{}'),
  ('d4000000-0000-4000-8000-000000000006', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000009.jpg', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":512}', '{}'),
  ('d4000000-0000-4000-8000-000000000007', 'trip-media', 'b2000000-0000-4000-8000-000000000001/audio/c3000000-0000-4000-8000-000000000010.webm', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '{"mimetype":"audio/webm","size":512}', '{}'),
  ('d4000000-0000-4000-8000-000000000010', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000008.jpg', 'a1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', '{"mimetype":"image/jpeg","size":1}', '{}'),
  ('d4000000-0000-4000-8000-000000000011', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000011.jpg', 'a1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', '{"mimetype":"image/jpeg","size":1}', '{}'),
  ('d4000000-0000-4000-8000-000000000012', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000012.jpg', 'a1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000007', '{"mimetype":"image/jpeg","size":1}', '{}'),
  ('d4000000-0000-4000-8000-000000000013', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000013.jpg', 'a1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000007', '{"mimetype":"image/jpeg","size":1}', '{}');

-- These fixture rows represent legacy gallery data present before migration 82.
-- Disable just the new-gallery guard for insertion, then restore it before tests.
ALTER TABLE public.trip_media DISABLE TRIGGER guard_trip_media_public_gallery;
INSERT INTO public.trip_media (id, trip_id, caption, storage_path, content_type, byte_size, created_by, kind, deleted_at, public_gallery, duration_ms, updated_by)
VALUES
  ('c3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Shared legacy photo', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg', 'image/jpeg', 512, 'a1000000-0000-4000-8000-000000000001', 'photo', NULL, true, NULL, 'a1000000-0000-4000-8000-000000000001'),
  ('c3000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'Legacy public tombstone', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000004.jpg', 'image/jpeg', 512, 'a1000000-0000-4000-8000-000000000001', 'photo', now(), true, NULL, 'a1000000-0000-4000-8000-000000000001'),
  ('c3000000-0000-4000-8000-000000000010', 'b2000000-0000-4000-8000-000000000001', 'Legacy audio clip', 'b2000000-0000-4000-8000-000000000001/audio/c3000000-0000-4000-8000-000000000010.webm', 'audio/webm', 512, 'a1000000-0000-4000-8000-000000000001', 'audio', now(), false, 1000, 'a1000000-0000-4000-8000-000000000001');
ALTER TABLE public.trip_media ENABLE TRIGGER guard_trip_media_public_gallery;

-- Pending invitation fixtures are inserted with the lifecycle trigger enabled.
-- The acceptance calls below also exercise its status-transition behavior.
INSERT INTO public.trip_invitations (id, trip_id, email, role, status, invited_by, invited_user_id, expires_at, status_changed_at, status_changed_by)
VALUES
  ('e5000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'media-rls-owner@example.invalid', 'viewer', 'pending', 'a1000000-0000-4000-8000-000000000001', NULL, now() + interval '1 day', now(), 'a1000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'media-rls-editor@example.invalid', 'viewer', 'pending', 'a1000000-0000-4000-8000-000000000001', NULL, now() + interval '1 day', now(), 'a1000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'media-rls-reactivate@example.invalid', 'viewer', 'pending', 'a1000000-0000-4000-8000-000000000001', NULL, now() + interval '1 day', now(), 'a1000000-0000-4000-8000-000000000001');

-- 1: current viewer can read shared metadata and the creator-owned object.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","email":"media-rls-viewer@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'viewer could not select shared photo metadata (count=%)', n; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'trip-media' AND name = 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg';
  IF n <> 1 THEN RAISE EXCEPTION 'viewer could not select shared Storage object (count=%)', n; END IF;
  RAISE NOTICE 'PASS 1 - active viewer reads shared photo metadata and Storage object';
END;
$$;

-- 2: a viewer can insert an owned canonical object and matching metadata.
INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata, user_metadata)
VALUES ('d4000000-0000-4000-8000-000000000008', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000002.jpg', 'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":640}', '{}');
INSERT INTO public.trip_media (id, trip_id, caption, storage_path, content_type, byte_size, created_by, kind, updated_by)
VALUES ('c3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Viewer contribution', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000002.jpg', 'image/jpeg', 640, 'a1000000-0000-4000-8000-000000000002', 'photo', auth.uid());
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000002' AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'viewer contribution did not persist under authenticated identity';
  END IF;
  RAISE NOTICE 'PASS 2 - viewer inserts own canonical object and creator-owned metadata';
END;
$$;

-- Metadata checks: mismatched extension/MIME, out-of-range sizes, path identity,
-- and an object whose path matches but whose owner does not match created_by.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind)
    VALUES ('c3000000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000005.png', 'image/jpeg', 512, auth.uid(), 'photo');
    RAISE EXCEPTION 'expected MIME/extension mismatch to fail' USING ERRCODE = 'ZX001';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind)
    VALUES ('c3000000-0000-4000-8000-000000000006', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000006.jpg', 'image/jpeg', 0, auth.uid(), 'photo');
    RAISE EXCEPTION 'expected undersized image to fail' USING ERRCODE = 'ZX002';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind)
    VALUES ('c3000000-0000-4000-8000-000000000007', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000007.jpg', 'image/jpeg', 10485761, auth.uid(), 'photo');
    RAISE EXCEPTION 'expected oversized image to fail' USING ERRCODE = 'ZX003';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind)
    VALUES ('c3000000-0000-4000-8000-000000000008', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000005.png', 'image/png', 512, auth.uid(), 'photo');
    RAISE EXCEPTION 'expected metadata id/path mismatch to fail' USING ERRCODE = 'ZX004';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind)
    VALUES ('c3000000-0000-4000-8000-000000000009', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000009.jpg', 'image/jpeg', 512, auth.uid(), 'photo');
    RAISE EXCEPTION 'expected wrong-owner Storage object to fail metadata validation' USING ERRCODE = 'ZX005';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  RAISE NOTICE 'PASS 3 - metadata trigger rejects MIME, size, ID/path, and object-owner mismatches';
END;
$$;

-- A member cannot evade canonical path/owner restrictions on direct Storage writes.
DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata, user_metadata)
    VALUES ('trip-media', 'b2000000-0000-4000-8000-000000000001/nested/c3000000-0000-4000-8000-000000000008.jpg', auth.uid(), auth.uid()::text, '{"mimetype":"image/jpeg","size":1}', '{}');
    RAISE EXCEPTION 'expected nested/noncanonical object path to fail' USING ERRCODE = 'ZX006';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata, user_metadata)
    VALUES ('trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000008.jpg', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":1}', '{}');
    RAISE EXCEPTION 'expected non-self Storage owner to fail' USING ERRCODE = 'ZX007';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS 4 - Storage insert enforces exact path form and authenticated owner';
END;
$$;

-- Member B cannot mutate or remove Member A's photo metadata or object.
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.trip_media SET caption = 'unauthorized overwrite' WHERE id = 'c3000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'viewer updated another member''s photo metadata'; END IF;
  DELETE FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'viewer deleted another member''s photo metadata'; END IF;
  UPDATE storage.objects SET metadata = '{"mimetype":"image/jpeg","size":999}' WHERE bucket_id = 'trip-media' AND name = 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'viewer overwrote another member''s Storage object'; END IF;
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE bucket_id = 'trip-media' AND name = 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'viewer deleted another member''s Storage object'; END IF;
  RAISE NOTICE 'PASS 5 - viewer cannot update/delete another member''s metadata or Storage object';
END;
$$;
RESET ROLE;

-- A brand-new photo cannot opt into public-gallery visibility.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","email":"media-rls-viewer@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind, public_gallery)
    VALUES ('c3000000-0000-4000-8000-000000000008', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000008.jpg', 'image/jpeg', 512, auth.uid(), 'photo', true);
    RAISE EXCEPTION 'expected new public-gallery photo to fail' USING ERRCODE = 'ZX008';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS 6 - new public_gallery=true metadata is rejected';
END;
$$;

-- Active editor can read and contribute photo media.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","email":"media-rls-editor@example.invalid"}', true);
INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata, user_metadata)
VALUES ('d4000000-0000-4000-8000-000000000009', 'trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000003.jpg', 'a1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', '{"mimetype":"image/jpeg","size":1024}', '{}');
INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind, updated_by)
VALUES ('c3000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000003.jpg', 'image/jpeg', 1024, auth.uid(), 'photo', auth.uid());
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'editor could not read shared photo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000003' AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'editor contribution did not persist';
  END IF;
  RAISE NOTICE 'PASS 7 - active editor reads shared media and contributes own photo';
END;
$$;

-- An active editor retains the legacy audio-owner/editor delete right.
DO $$
DECLARE n integer;
BEGIN
  DELETE FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000010';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'active editor could not delete another author''s audio row (count=%)', n; END IF;
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE bucket_id = 'trip-media' AND name = 'b2000000-0000-4000-8000-000000000001/audio/c3000000-0000-4000-8000-000000000010.webm';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'active editor could not delete another author''s audio object (count=%)', n; END IF;
  RAISE NOTICE 'PASS 8 - editor retains audio metadata and Storage-object delete behavior';
END;
$$;
RESET ROLE;

-- Restoring legacy public tombstone materializes a fresh private share.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"media-rls-owner@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE is_public boolean;
BEGIN
  UPDATE public.trip_media SET deleted_at = NULL WHERE id = 'c3000000-0000-4000-8000-000000000004';
  SELECT public_gallery INTO is_public FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000004';
  IF is_public IS DISTINCT FROM false THEN RAISE EXCEPTION 'restored legacy tombstone did not become private'; END IF;
  RAISE NOTICE 'PASS 9 - restoring legacy public tombstone sets public_gallery=false';
END;
$$;
RESET ROLE;

-- Stale membership statuses (removed_at and deleted_at) cannot read or write.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated","email":"media-rls-removed@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'removed_at member can read photo metadata'; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'trip-media' AND name = 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg';
  IF n <> 0 THEN RAISE EXCEPTION 'removed_at member can read Storage object'; END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata, user_metadata)
    VALUES ('trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000008.jpg', auth.uid(), auth.uid()::text, '{"mimetype":"image/jpeg","size":1}', '{}');
    RAISE EXCEPTION 'expected removed_at Storage insert to fail' USING ERRCODE = 'ZX009';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind)
    VALUES ('c3000000-0000-4000-8000-000000000008', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000008.jpg', 'image/jpeg', 1, auth.uid(), 'photo');
    RAISE EXCEPTION 'expected removed_at metadata insert to fail' USING ERRCODE = 'ZX010';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS 10 - removed_at membership cannot read or write photo metadata/Storage';
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000005', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated","email":"media-rls-deleted@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'deleted_at member can read photo metadata'; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'trip-media' AND name = 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg';
  IF n <> 0 THEN RAISE EXCEPTION 'deleted_at member can read Storage object'; END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata, user_metadata)
    VALUES ('trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000008.jpg', auth.uid(), auth.uid()::text, '{"mimetype":"image/jpeg","size":1}', '{}');
    RAISE EXCEPTION 'expected deleted_at Storage insert to fail' USING ERRCODE = 'ZX011';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind)
    VALUES ('c3000000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000011.jpg', 'image/jpeg', 1, auth.uid(), 'photo');
    RAISE EXCEPTION 'expected deleted_at metadata insert to fail' USING ERRCODE = 'ZX012';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS 11 - deleted_at membership cannot read or write photo metadata/Storage';
END;
$$;
RESET ROLE;

-- Nonmember must be denied too.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000007', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000007","role":"authenticated","email":"media-rls-outsider@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'nonmember can read photo metadata'; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'trip-media' AND name = 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg';
  IF n <> 0 THEN RAISE EXCEPTION 'nonmember can read Storage object'; END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata, user_metadata)
    VALUES ('trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000008.jpg', auth.uid(), auth.uid()::text, '{"mimetype":"image/jpeg","size":1}', '{}');
    RAISE EXCEPTION 'expected nonmember Storage insert to fail' USING ERRCODE = 'ZX013';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind, updated_by)
    VALUES ('c3000000-0000-4000-8000-000000000013', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000013.jpg', 'image/jpeg', 1, auth.uid(), 'photo', auth.uid());
    RAISE EXCEPTION 'expected nonmember metadata insert to fail' USING ERRCODE = 'ZX015';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'PASS 12 - authenticated nonmember cannot read or write trip media';
END;
$$;
RESET ROLE;

-- Anonymous access is denied whether by missing table privilege or by RLS.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
DECLARE n integer := 0;
DECLARE denied boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.trip_media WHERE id = 'c3000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied AND n <> 0 THEN RAISE EXCEPTION 'anon can read photo metadata'; END IF;
  n := 0;
  denied := false;
  BEGIN
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'trip-media' AND name = 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg';
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied AND n <> 0 THEN RAISE EXCEPTION 'anon can read Storage object'; END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata, user_metadata)
    VALUES ('trip-media', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000008.jpg', NULL, NULL, '{"mimetype":"image/jpeg","size":1}', '{}');
    RAISE EXCEPTION 'expected anon Storage insert to fail' USING ERRCODE = 'ZX014';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.trip_media (id, trip_id, storage_path, content_type, byte_size, created_by, kind, updated_by)
    VALUES ('c3000000-0000-4000-8000-000000000013', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000013.jpg', 'image/jpeg', 1, auth.uid(), 'photo', auth.uid());
    RAISE EXCEPTION 'expected anon metadata insert to fail' USING ERRCODE = 'ZX016';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 13 - anon cannot read or write trip media';
END;
$$;
RESET ROLE;

-- Re-accepting invitations preserves existing owner/editor roles. A removed
-- membership takes the invite's viewer role and clears all soft-removal fields.
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"media-rls-owner@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE m public.trip_members;
DECLARE invitation public.trip_invitations;
BEGIN
  SELECT * INTO m FROM public.accept_trip_invitation('e5000000-0000-4000-8000-000000000001');
  IF m.role <> 'owner' THEN RAISE EXCEPTION 're-acceptance demoted active owner to %', m.role; END IF;
  SELECT * INTO invitation FROM public.trip_invitations WHERE id = 'e5000000-0000-4000-8000-000000000001';
  IF invitation.status <> 'accepted' OR invitation.version <> 2 OR invitation.updated_at IS NULL
    OR invitation.status_changed_at IS NULL OR invitation.status_changed_by <> auth.uid()
    OR invitation.accepted_at IS NULL OR invitation.accepted_by <> auth.uid()
    OR invitation.rejected_at IS NOT NULL OR invitation.rejected_by IS NOT NULL
    OR invitation.revoked_at IS NOT NULL OR invitation.revoked_by IS NOT NULL THEN
    RAISE EXCEPTION 'acceptance did not preserve invitation lifecycle metadata';
  END IF;
  RAISE NOTICE 'PASS 14 - acceptance preserves lifecycle metadata and active owner role';
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated","email":"media-rls-editor@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE m public.trip_members;
BEGIN
  SELECT * INTO m FROM public.accept_trip_invitation('e5000000-0000-4000-8000-000000000002');
  IF m.role <> 'editor' THEN RAISE EXCEPTION 're-acceptance demoted active editor to %', m.role; END IF;
  RAISE NOTICE 'PASS 15 - re-accepting invitation preserves active editor role';
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000006', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000006","role":"authenticated","email":"media-rls-reactivate@example.invalid"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE m public.trip_members;
BEGIN
  SELECT * INTO m FROM public.accept_trip_invitation('e5000000-0000-4000-8000-000000000003');
  IF m.role <> 'viewer' OR m.removed_at IS NOT NULL OR m.removed_by IS NOT NULL OR m.deleted_at IS NOT NULL OR m.deleted_by IS NOT NULL THEN
    RAISE EXCEPTION 'soft-removed membership was not reactivated with invite role and cleared fields';
  END IF;
  RAISE NOTICE 'PASS 16 - reactivation uses invitation role and clears removal/deletion fields';
END;
$$;

-- 16 assertion groups passed if execution reaches this point. This rollback is
-- unconditional on the success path; psql's ON_ERROR_STOP closes/rolls back
-- the open transaction if any assertion above raises an error.
ROLLBACK;
