-- =====================================================
-- Add UPDATE policies for clients table
-- Clients can update their own record (e.g. avatar_url)
-- Staff can update clients in their firm
-- =====================================================

DROP POLICY IF EXISTS clients_update_self ON clients;
DROP POLICY IF EXISTS clients_update_staff ON clients;

-- Clients can update their own record
CREATE POLICY clients_update_self ON clients
  FOR UPDATE
  USING (auth_user_id = auth.uid());

-- Staff can update clients in their firm
CREATE POLICY clients_update_staff ON clients
  FOR UPDATE
  USING (
    firm_id IN (
      SELECT firm_id FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- Backfill: Sync avatar_url from auth metadata to clients table
-- For clients who already uploaded a photo before the UPDATE policy existed
-- =====================================================
UPDATE clients c
SET avatar_url = u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
WHERE c.auth_user_id = u.id
  AND u.raw_user_meta_data->>'avatar_url' IS NOT NULL
  AND (c.avatar_url IS NULL OR c.avatar_url = '');
