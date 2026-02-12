-- =====================================================
-- AVATAR MIGRATION SCRIPT
-- =====================================================

-- 1. Add avatar_url to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Add avatar_url to clients table (future proofing)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Ensure Avatars bucket is public (in case it wasn't set correctly before)
UPDATE storage.buckets SET public = true WHERE id = 'avatars';
