-- =====================================================
-- GHL WEBHOOKS MIGRATION
-- Ensures robust logging for all GHL events
-- =====================================================

-- 1. Create or Update Webhooks Table
CREATE TABLE IF NOT EXISTS public.ghl_webhooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Core fields
    event_type TEXT,
    payload JSONB,
    firm_id UUID REFERENCES public.firms(firm_id) ON DELETE SET NULL, -- Nullable for raw logs
    
    -- Extracted fields for easier querying
    location_id TEXT,
    company_id TEXT,
    user_id TEXT,
    app_id TEXT,
    
    -- Processing status
    processed BOOLEAN DEFAULT false,
    processing_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure firm_id is nullable (in case it was created as NOT NULL previously)
ALTER TABLE public.ghl_webhooks ALTER COLUMN firm_id DROP NOT NULL;

-- 3. Add Columns if they don't exist (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ghl_webhooks' AND column_name='company_id') THEN
        ALTER TABLE public.ghl_webhooks ADD COLUMN company_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ghl_webhooks' AND column_name='user_id') THEN
        ALTER TABLE public.ghl_webhooks ADD COLUMN user_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ghl_webhooks' AND column_name='app_id') THEN
        ALTER TABLE public.ghl_webhooks ADD COLUMN app_id TEXT;
    END IF;
END $$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_ghl_webhooks_location ON public.ghl_webhooks(location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_webhooks_type ON public.ghl_webhooks(event_type);
CREATE INDEX IF NOT EXISTS idx_ghl_webhooks_created ON public.ghl_webhooks(created_at DESC);

-- 5. RLS
ALTER TABLE public.ghl_webhooks ENABLE ROW LEVEL SECURITY;

-- Allow Service Role full access
GRANT ALL ON public.ghl_webhooks TO service_role;

-- Allow Staff to view logs for their firm (if firm_id is linked)
CREATE POLICY "Staff can view firm webhooks" ON public.ghl_webhooks
    FOR SELECT
    USING (
        firm_id IN (
            SELECT firm_id FROM public.staff 
            WHERE auth_user_id = auth.uid() 
            AND role IN ('Firm Owner', 'Admin')
        )
    );
