-- =====================================================
-- GHL WEBHOOKS RESET (STRICT PAYLOAD MATCHING)
-- Creates table with columns matching GHL payload fields EXACTLY (Case Sensitive)
-- =====================================================

DROP TABLE IF EXISTS public.ghl_webhooks CASCADE;

CREATE TABLE public.ghl_webhooks (
    -- 1. Payload Fields (Quoted Identifiers for Case Sensitivity)
    "type" TEXT,
    "locationId" TEXT,
    "versionId" TEXT,
    "appId" TEXT,
    "installType" TEXT,
    "companyId" TEXT,
    "userId" TEXT,
    "companyName" TEXT,
    "isWhitelabelCompany" BOOLEAN,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "tags" JSONB,
    "country" TEXT,
    "dateAdded" TIMESTAMPTZ,
    "customFields" JSONB,
    "attributionSource" JSONB,
    "timestamp" TIMESTAMPTZ,
    "webhookId" TEXT,
    
    -- "id" is ambiguous (Could be Contact ID or nothing). 
    -- We map payload.id to "contactId" column usually, but user wants "id" column?
    -- If payload has "id", we put it in "id". BUT we need a Primary Key.
    -- We will use "record_id" as PK.
    "id" TEXT, -- Stores payload.id (Contact ID usually)

    -- 2. System Fields (Necessary for RLS/Auditing)
    "record_id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "firm_id" UUID REFERENCES public.firms(firm_id) ON DELETE SET NULL,
    "payload" JSONB,
    "processed" BOOLEAN DEFAULT false,
    "processing_error" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ghl_webhooks_location ON public.ghl_webhooks("locationId");
CREATE INDEX idx_ghl_webhooks_type ON public.ghl_webhooks("type");
CREATE INDEX idx_ghl_webhooks_created ON public.ghl_webhooks("created_at" DESC);

-- RLS
ALTER TABLE public.ghl_webhooks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ghl_webhooks TO service_role;

-- Policy
CREATE POLICY "Staff can view firm webhooks" ON public.ghl_webhooks
    FOR SELECT
    USING (
        firm_id IN (
            SELECT firm_id FROM public.staff 
            WHERE auth_user_id = auth.uid() 
            AND role IN ('Firm Owner', 'Admin')
        )
    );
