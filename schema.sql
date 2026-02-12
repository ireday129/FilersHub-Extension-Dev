-- =====================================================
-- FIRMS (Tenants)
-- =====================================================
CREATE TABLE firms (
  firm_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_name TEXT NOT NULL,
  logo_url TEXT,
  brand_color TEXT DEFAULT '#4a90e2', -- hex color
  
  -- GHL Integration (OAuth)
  ghl_location_id TEXT,
  ghl_access_token TEXT, -- OAuth Access Token
  ghl_refresh_token TEXT, -- OAuth Refresh Token
  ghl_token_expires_at TIMESTAMP WITH TIME ZONE, -- Token Expiry
  ghl_custom_field_group TEXT DEFAULT 'FilersHub',
  ghl_custom_field_name TEXT DEFAULT 'Return Status',
  
  -- Subscription
  subscription_tier TEXT DEFAULT 'starter',
  max_clients INTEGER DEFAULT 500,
  max_staff INTEGER DEFAULT 10,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'active',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_firms_ghl_location ON firms(ghl_location_id);

-- =====================================================
-- STAFF
-- =====================================================
CREATE TABLE staff (
  staff_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(firm_id) ON DELETE CASCADE,
  
  -- User Info
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Firm Owner', 'Manager', 'Tax Pro')),
  
  -- Permissions (JSON for flexibility)
  permissions JSONB DEFAULT '{}',
  
  -- Auth
  auth_user_id UUID, -- Supabase auth.users.id
  
  -- GHL Integration
  ghl_user_id TEXT,
  ghl_location_id TEXT,
  
  -- Invitation System
  invite_status TEXT DEFAULT 'pending' CHECK (invite_status IN ('pending', 'accepted', 'expired')),
  invite_sent_at TIMESTAMP WITH TIME ZONE,
  invite_accepted_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_staff_firm ON staff(firm_id);
CREATE INDEX idx_staff_email ON staff(email);
CREATE INDEX idx_staff_auth_user ON staff(auth_user_id);
CREATE INDEX idx_staff_ghl_user ON staff(ghl_user_id);
CREATE INDEX idx_staff_invite_status ON staff(firm_id, invite_status);

-- =====================================================
-- CLIENTS
-- =====================================================
CREATE TABLE clients (
  client_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(firm_id) ON DELETE CASCADE,
  
  -- Client Info
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  
  -- GHL Integration
  ghl_contact_id TEXT,
  
  -- Tax Return Status
  tax_return_status TEXT NOT NULL DEFAULT 'Waiting on Documents'
    CHECK (tax_return_status IN (
      'Waiting on Documents',
      'In Progress',
      'Ready for Review',
      'Completed'
    )),
  
  -- Auth
  auth_user_id UUID, -- Supabase auth.users.id for magic link
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_clients_firm ON clients(firm_id);
CREATE INDEX idx_clients_ghl_contact ON clients(ghl_contact_id);
CREATE INDEX idx_clients_email ON clients(firm_id, email);
CREATE INDEX idx_clients_status ON clients(firm_id, tax_return_status);

-- =====================================================
-- DOCUMENTS
-- =====================================================
CREATE TABLE documents (
  doc_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  firm_id UUID NOT NULL REFERENCES firms(firm_id) ON DELETE CASCADE,
  
  -- File Info
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx')),
  file_size INTEGER NOT NULL, -- bytes, max 8MB (8388608 bytes)
  file_url TEXT NOT NULL, -- Supabase storage path
  
  -- Categorization
  document_category TEXT DEFAULT 'Other'
    CHECK (document_category IN ('W2', '1099', 'Receipt', 'Completed Return', 'Other')),
  
  -- Upload Tracking
  uploaded_by UUID NOT NULL, -- staff_id or client_id
  uploader_type TEXT NOT NULL CHECK (uploader_type IN ('staff', 'client')),
  
  -- Source Tracking
  source TEXT DEFAULT 'filershub' CHECK (source IN ('filershub', 'ghl_import')),
  ghl_attachment_id TEXT, -- if imported from GHL
  
  -- E-Signature
  requires_signature BOOLEAN DEFAULT FALSE,
  signature_id UUID, -- references signatures table
  
  -- Soft Delete
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID, -- staff_id who deleted
  
  -- Timestamps
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_client ON documents(client_id, is_deleted);
CREATE INDEX idx_documents_firm ON documents(firm_id);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at);
CREATE INDEX idx_documents_ghl_attachment ON documents(ghl_attachment_id);

-- =====================================================
-- SIGNATURES
-- =====================================================
CREATE TABLE signatures (
  signature_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  
  -- Signature Data (base64 canvas data or image URL)
  signature_data TEXT NOT NULL,
  signature_image_url TEXT, -- optional: stored signature image
  
  -- Audit
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_signatures_doc ON signatures(doc_id);
CREATE INDEX idx_signatures_client ON signatures(client_id);

-- =====================================================
-- AUDIT LOGS
-- =====================================================
CREATE TABLE audit_logs (
  log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(firm_id) ON DELETE CASCADE,
  
  -- Actor
  user_id UUID NOT NULL, -- staff_id or client_id
  user_type TEXT NOT NULL CHECK (user_type IN ('staff', 'client')),
  user_email TEXT,
  
  -- Action
  action TEXT NOT NULL CHECK (action IN (
    'upload',
    'download',
    'delete',
    'view',
    'status_change',
    'sign',
    'create_client',
    'update_client',
    'create_staff',
    'login'
  )),
  
  -- Target
  target_type TEXT CHECK (target_type IN ('document', 'client', 'staff', 'firm')),
  target_id UUID,
  
  -- Details
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  
  -- Timestamp
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_firm_timestamp ON audit_logs(firm_id, timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- =====================================================
-- GHL WEBHOOKS
-- =====================================================
CREATE TABLE ghl_webhooks (
  webhook_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID REFERENCES firms(firm_id) ON DELETE CASCADE,
  
  -- Webhook Data
  event_type TEXT NOT NULL, -- ContactCreate, FormSubmission, etc.
  payload JSONB NOT NULL,
  
  -- Processing
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  
  -- Timestamp
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ghl_webhooks_firm ON ghl_webhooks(firm_id);
CREATE INDEX idx_ghl_webhooks_processed ON ghl_webhooks(processed, received_at);

-- =====================================================
-- SUBSCRIPTIONS
-- =====================================================
CREATE TABLE subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID NOT NULL REFERENCES firms(firm_id) ON DELETE CASCADE,
  
  -- Stripe
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  
  -- Plan
  plan_tier TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan_tier IN ('starter', 'growth', 'enterprise')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  
  -- Billing
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_firm ON subscriptions(firm_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STAFF POLICIES
-- =====================================================

-- Staff can only see other staff in their firm
CREATE POLICY staff_select_own_firm ON staff
  FOR SELECT
  USING (
    firm_id IN (
      SELECT firm_id FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- Only Firm Owner can create staff
CREATE POLICY staff_insert_firm_owner ON staff
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE auth_user_id = auth.uid()
      AND role = 'Firm Owner'
      AND firm_id = staff.firm_id
    )
  );

-- =====================================================
-- CLIENT POLICIES
-- =====================================================

-- Staff can see clients in their firm
CREATE POLICY clients_select_staff ON clients
  FOR SELECT
  USING (
    firm_id IN (
      SELECT firm_id FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- Clients can only see themselves
CREATE POLICY clients_select_self ON clients
  FOR SELECT
  USING (auth_user_id = auth.uid());

-- =====================================================
-- DOCUMENT POLICIES
-- =====================================================

-- Staff can see all documents in their firm
CREATE POLICY documents_select_staff ON documents
  FOR SELECT
  USING (
    firm_id IN (
      SELECT firm_id FROM staff WHERE auth_user_id = auth.uid()
    )
    AND is_deleted = FALSE
  );

-- Clients can only see their own documents
CREATE POLICY documents_select_client ON documents
  FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM clients WHERE auth_user_id = auth.uid()
    )
    AND is_deleted = FALSE
  );

-- Staff can upload documents for clients in their firm
CREATE POLICY documents_insert_staff ON documents
  FOR INSERT
  WITH CHECK (
    firm_id IN (
      SELECT firm_id FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- Clients can upload documents for themselves
CREATE POLICY documents_insert_client ON documents
  FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT client_id FROM clients WHERE auth_user_id = auth.uid()
    )
  );

-- =====================================================
-- AUDIT LOG POLICIES
-- =====================================================

-- Staff can view audit logs for their firm
CREATE POLICY audit_logs_select_staff ON audit_logs
  FOR SELECT
  USING (
    firm_id IN (
      SELECT firm_id FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- All authenticated users can insert audit logs
CREATE POLICY audit_logs_insert_all ON audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- STORAGE RLS POLICIES (Conceptual - applied in Supabase Storage UI or via CLI)
-- =====================================================
-- =====================================================
-- STORAGE RLS POLICIES
-- =====================================================

-- =====================================================
-- STORAGE BUCKETS INITIALIZATION
-- =====================================================
-- Attempt to insert buckets if they don't exist
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('documents', 'documents', false),
  ('firm-assets', 'firm-assets', true),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STORAGE RLS POLICIES
-- =====================================================

-- 1. Documents Bucket (Private)
-- Structure: {firm_id}/{client_id}/{filename}

-- Staff can view/upload/delete documents for their firm
CREATE POLICY documents_staff_all ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
      SELECT firm_id::text FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- Clients can view/upload documents for themselves
CREATE POLICY documents_client_all ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] IN (
      SELECT client_id::text FROM clients WHERE auth_user_id = auth.uid()
    )
  );

-- 2. Firm Assets Bucket (Public)
-- Structure: {firm_id}/logo.png

-- Everyone can view firm assets (Public)
CREATE POLICY firm_assets_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'firm-assets');

-- Staff can upload/update their firm's assets
CREATE POLICY firm_assets_insert_update_staff ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'firm-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT firm_id::text FROM staff WHERE auth_user_id = auth.uid()
    )
  );

-- 3. Avatars Bucket (Public)
-- Structure: {user_id}/avatar.png

-- Everyone can view avatars
CREATE POLICY avatars_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Users can upload/update their own avatar
CREATE POLICY avatars_insert_update_self ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
