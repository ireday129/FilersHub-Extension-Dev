-- Add GHL specific columns to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Add index for faster lookups by GHL ID
CREATE INDEX IF NOT EXISTS idx_clients_ghl_contact_id ON clients(ghl_contact_id);

-- Add constraint to ensure ghl_contact_id is unique per firm (optional, but good practice if 1:1)
-- However, GHL allows duplicates sometimes, but we should try to keep 1:1.
-- Let's just index it for now.

COMMENT ON COLUMN clients.ghl_contact_id IS 'The ID of the contact in GoHighLevel CRM';
COMMENT ON COLUMN clients.last_synced_at IS 'Timestamp interaction with GHL occurred';
