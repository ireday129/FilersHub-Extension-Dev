-- Create GHL Users Table matching payload exactly (camelCase, quoted)
CREATE TABLE IF NOT EXISTS public."users" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "extension" TEXT,
    "dob" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "zip" TEXT,
    "address" TEXT,
    "locationId" TEXT,
    "roles" JSONB,
    "permissions" JSONB,
    "companyId" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public."users" TO service_role;
GRANT SELECT ON public."users" TO authenticated;

-- Function to dynamic ingest user fields (similar to webhooks if needed)
-- But for now, we define standard fields commonly seen on GHL User Object.
