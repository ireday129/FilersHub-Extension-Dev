-- Add GHL specific columns to clients table using EXACT payload names (camelCase)
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS "contactId" TEXT,
ADD COLUMN IF NOT EXISTS "locationId" TEXT,
ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP WITH TIME ZONE;

-- Add index for faster lookups by GHL ID
CREATE INDEX IF NOT EXISTS "idx_clients_contactId" ON clients("contactId");
CREATE INDEX IF NOT EXISTS "idx_clients_locationId" ON clients("locationId");

COMMENT ON COLUMN clients."contactId" IS 'The ID of the contact in GoHighLevel CRM (matches payload key)';
COMMENT ON COLUMN clients."locationId" IS 'The Location ID in GoHighLevel CRM (matches payload key)';
COMMENT ON COLUMN clients."lastSyncedAt" IS 'Timestamp interaction with GHL occurred';
