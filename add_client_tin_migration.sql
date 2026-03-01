-- Add TIN (Taxpayer Identification Number) column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tin TEXT;
