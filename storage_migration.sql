-- =====================================================
-- STORAGE INITIALIZATION SCRIPT
-- Run this script in the Supabase SQL Editor separately if you already have the schema applied.
-- =====================================================

-- 1. Create Buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('documents', 'documents', false),
  ('firm-assets', 'firm-assets', true),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Clean up existing policies for storage.objects to avoid conflicts
DROP POLICY IF EXISTS documents_staff_all ON storage.objects;
DROP POLICY IF EXISTS documents_client_all ON storage.objects;
DROP POLICY IF EXISTS firm_assets_select_public ON storage.objects;
DROP POLICY IF EXISTS firm_assets_insert_update_staff ON storage.objects;
DROP POLICY IF EXISTS avatars_select_public ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_update_self ON storage.objects;

-- 3. Documents Bucket Policies
-- Structure: {firm_id}/{client_id}/{filename}

-- Staff Access
CREATE POLICY documents_staff_all ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT firm_id::text FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- Client Access
CREATE POLICY documents_client_all ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] IN (
      SELECT client_id::text FROM clients WHERE auth_user_id = auth.uid()
    )
  );

-- 4. Firm Assets Bucket Policies
-- Structure: {firm_id}/logo.png

-- Public Read
CREATE POLICY firm_assets_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'firm-assets');

-- Staff Write
CREATE POLICY firm_assets_insert_update_staff ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'firm-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT firm_id::text FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- 5. Avatars Bucket Policies
-- Structure: {user_id}/avatar.png

-- Public Read
CREATE POLICY avatars_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- User Write (Self)
CREATE POLICY avatars_insert_update_self ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
