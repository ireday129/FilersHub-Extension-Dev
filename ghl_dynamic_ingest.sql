-- =====================================================
-- DYNAMIC GHL WEBHOOK INGESTION
-- Automatically creates columns for any new payload keys
-- =====================================================

-- 1. Reset Table to Base Schema
DROP TABLE IF EXISTS public.ghl_webhooks CASCADE;

CREATE TABLE public.ghl_webhooks (
    -- System Fields (ALWAYS PRESENT)
    record_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    firm_id UUID REFERENCES public.firms(firm_id) ON DELETE SET NULL, -- Nullable
    payload JSONB, -- Stores the full raw payload
    processed BOOLEAN DEFAULT false,
    processing_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
    
    -- Dynamic columns will be added here automatically...
);

-- RLS
ALTER TABLE public.ghl_webhooks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ghl_webhooks TO service_role;

-- Policies
CREATE POLICY "Staff can view firm webhooks" ON public.ghl_webhooks
    FOR SELECT
    USING (
        firm_id IN (
            SELECT firm_id FROM public.staff 
            WHERE auth_user_id = auth.uid() 
            AND role IN ('Firm Owner', 'Admin')
        )
    );

-- 2. Dynamic Ingestion Function
CREATE OR REPLACE FUNCTION public.ingest_ghl_webhook(payload jsonb, firm_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Run as owner to allow ALTER TABLE
AS $$
DECLARE
    rec record;
    key text;
    val jsonb;
    type text;
    column_exists boolean;
    col_type text;
    result_id uuid;
    final_payload jsonb;
BEGIN
    -- A. Iterate over payload keys to add columns
    FOR key, val IN SELECT * FROM jsonb_each(payload) LOOP
        -- Skip empty keys or system keys we handle manually
        IF key = '' OR key = 'record_id' OR key = 'created_at' OR key = 'payload' OR key = 'processed' OR key = 'firm_id' THEN 
            CONTINUE; 
        END IF;
        
        -- Check if column exists
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'ghl_webhooks' 
            AND column_name = key
        ) INTO column_exists;
        
        -- Create column if missing
        IF NOT column_exists THEN
            -- Infer Type
            type := jsonb_typeof(val);
            IF type = 'object' OR type = 'array' THEN
                col_type := 'JSONB';
            ELSIF type = 'boolean' THEN
                col_type := 'BOOLEAN';
            ELSE
                col_type := 'TEXT'; -- Default to TEXT for everything else
            END IF;
            
            -- Add Column safely (using quote_ident for case-sensitivity)
            EXECUTE format('ALTER TABLE public.ghl_webhooks ADD COLUMN IF NOT EXISTS %I %s', key, col_type);
        END IF;
    END LOOP;

    -- B. Prepare Payload for Insertion
    -- We inject system fields into the JSON so jsonb_populate_record picks them up?
    -- No, jsonb_populate_record returns a record with NULLs for missing fields.
    -- We want defaults specifically for PK.
    -- Better strategy: INSERT explicitly using jsonb_populate_record, but handle PK separately.
    
    -- Construct full object merging payload + system fields
    -- usage: jsonb_populate_record(null::table, json)
    final_payload := payload || jsonb_build_object(
        'firm_id', firm_id,
        'payload', payload, -- Store raw payload in 'payload' column
        'processed', false
    );

    -- C. Insert Data
    -- We use `jsonb_populate_record` to map JSON keys to columns automatically.
    -- Since we just ensured all columns exist, this works perfectly.
    -- Note: record_id and created_at will use defaults if not in JSON (populate_record emits NULL, so we filter?)
    -- Wait, populate_record emits NULLs. 
    -- If we insert NULL into PK with Default, it tries to insert NULL (error).
    -- So we MUST generate ID here if not present.
    
    IF NOT (payload ? 'record_id') THEN
        final_payload := final_payload || jsonb_build_object('record_id', gen_random_uuid());
    END IF;
    
    INSERT INTO public.ghl_webhooks
    SELECT * FROM jsonb_populate_record(NULL::public.ghl_webhooks, final_payload)
    RETURNING record_id INTO result_id;

    RETURN result_id;
END;
$$;
