-- Add unique constraint to ghl_location_id in firms table
-- This allows ON CONFLICT (ghl_location_id) to work during app installation

-- First, ensure no duplicates exist (or handle them if necessary, here we assume clean state or unique data)
-- If distinct firms share a location_id, this will fail and manual cleanup is needed.

ALTER TABLE firms ADD CONSTRAINT firms_ghl_location_id_key UNIQUE (ghl_location_id);
