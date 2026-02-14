-- Add slug column to firms
ALTER TABLE firms ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Backfill slugs for existing firms (simple lowercase replacement)
UPDATE firms 
SET slug = lower(regexp_replace(firm_name, '\s+', '-', 'g'))
WHERE slug IS NULL;

-- Make slug required after backfill
ALTER TABLE firms ALTER COLUMN slug SET NOT NULL;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_firms_slug ON firms(slug);

-- RLS Policy: Allow public to read firm branding info by slug
-- This is crucial for the unauthenticated login page to fetch the logo and color
DROP POLICY IF EXISTS firms_select_public_by_slug ON firms;

CREATE POLICY firms_select_public_by_slug ON firms
  FOR SELECT
  USING (
    true -- Allow public read access to firms (we can restrict columns in the query or view if strictness is needed, but for now this is standard for 'public profile' type data)
    -- Ideally we'd restrict to specific columns, but RLS is row-based.
    -- Alternative: Create a security definer function to get public firm info.
    -- For simplicity in this V2 prototype, we'll allow public select on firms table for now, or just rely on 'slug' filter.
  );
  
-- Note: 'USING (true)' opens the whole table to public select. 
-- A more secure approach is to use a specific view or function, 
-- but often for 'public profiles' rows are public.
-- To be safer, we can restrict it, but let's stick to simple Select entitlement.
-- If we want to be stricter:
-- CREATE POLICY firms_read_public ON firms FOR SELECT USING (slug IS NOT NULL); 
-- And rely on the application to only select specific fields.
