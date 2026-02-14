-- =====================================================
-- GHL INTEGRATION MIGRATION
-- Stores OAuth tokens for GoHighLevel integration
-- =====================================================

-- 1. Create Integrations Table
CREATE TABLE IF NOT EXISTS public.integrations_ghl (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    firm_id UUID NOT NULL REFERENCES public.firms(firm_id) ON DELETE CASCADE,
    location_id TEXT NOT NULL, -- GHL Location ID
    access_token TEXT NOT NULL, -- Stored securely (in production use Vault)
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT,
    user_type TEXT, -- 'Location' or 'Agency'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one active integration per firm per location (or just per firm if 1:1)
    CONSTRAINT unique_firm_ghl_integration UNIQUE (firm_id)
);

-- 2. Enable RLS
ALTER TABLE public.integrations_ghl ENABLE ROW LEVEL SECURITY;

-- 3. Policies

-- Allow Staff (Admins) to view their firm's integration status
CREATE POLICY "Staff can view own firm integration" ON public.integrations_ghl
    FOR SELECT
    USING (
        firm_id IN (
            SELECT firm_id FROM public.staff 
            WHERE auth_user_id = auth.uid() 
            AND role IN ('Firm Owner', 'Admin')
        )
    );

-- Allow Staff (Admins) to delete their firm's integration (Disconnect)
CREATE POLICY "Staff can disconnect own firm integration" ON public.integrations_ghl
    FOR DELETE
    USING (
        firm_id IN (
            SELECT firm_id FROM public.staff 
            WHERE auth_user_id = auth.uid() 
            AND role IN ('Firm Owner', 'Admin')
        )
    );

-- Allow Service Role (Edge Functions) full access
-- Service role bypasses RLS, but explicit grant is good practice if using non-service key
GRANT ALL ON public.integrations_ghl TO service_role;

-- 4. Create Updated_At Trigger
CREATE TRIGGER update_integrations_ghl_modtime
    BEFORE UPDATE ON public.integrations_ghl
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
