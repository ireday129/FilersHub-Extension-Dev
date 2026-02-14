-- Add GHL specific columns to clients table using EXACT payload names (id, locationId)
-- Since 'id' payload maps to Contact ID, we use "id" column if possible.
-- Assuming clients table PK is client_id (UUID), "id" is available.

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS "id" TEXT, -- Maps to GHL Contact 'id' payload
ADD COLUMN IF NOT EXISTS "locationId" TEXT,
ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP WITH TIME ZONE;

-- Add index for faster lookups by GHL ID
CREATE INDEX IF NOT EXISTS "idx_clients_ghl_id" ON clients("id");
CREATE INDEX IF NOT EXISTS "idx_clients_locationId" ON clients("locationId");

COMMENT ON COLUMN clients."id" IS 'The ID of the contact in GoHighLevel CRM (matches payload key "id")';
COMMENT ON COLUMN clients."locationId" IS 'The Location ID in GoHighLevel CRM (matches payload key)';
COMMENT ON COLUMN clients."lastSyncedAt" IS 'Timestamp interaction with GHL occurred';
