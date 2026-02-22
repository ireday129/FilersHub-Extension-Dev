-- =====================================================
-- IRS TRANSCRIPT MONITOR SCHEMA
-- =====================================================

-- Ensure vault extension is available
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Explicitly set search path to prevent pg_catalog permission errors
SET search_path TO public;

-- =====================================================
-- IRS CONNECTIONS
-- =====================================================
CREATE TABLE irs_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token_vault_id UUID NOT NULL, -- Reference to Vault secret
  refresh_token_vault_id UUID NOT NULL, -- Reference to Vault secret
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  refresh_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  irs_user_id TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'active' CHECK (consent_status IN ('active', 'revoked', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =====================================================
-- MONITORED CLIENTS
-- =====================================================
CREATE TABLE monitored_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ghl_contact_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  tin TEXT NOT NULL, -- Encrypted at rest
  tin_type TEXT NOT NULL CHECK (tin_type IN ('SSN', 'EIN', 'UNKNOWN')),
  monitoring_active BOOLEAN DEFAULT TRUE,
  last_poll_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TRANSCRIPT SNAPSHOTS
-- =====================================================
CREATE TABLE transcript_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_client_id UUID NOT NULL REFERENCES monitored_clients(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  transcript_type TEXT NOT NULL,
  transaction_codes JSONB NOT NULL DEFAULT '[]',
  raw_response JSONB,
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ALERT PREFERENCES
-- =====================================================
CREATE TABLE alert_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript_code TEXT NOT NULL,
  code_description TEXT NOT NULL,
  alert_enabled BOOLEAN DEFAULT TRUE,
  notify_email BOOLEAN DEFAULT TRUE,
  notify_sms BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, transcript_code)
);

-- =====================================================
-- ALERT LOG
-- =====================================================
CREATE TABLE alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monitored_client_id UUID NOT NULL REFERENCES monitored_clients(id) ON DELETE CASCADE,
  transcript_code TEXT NOT NULL,
  code_description TEXT NOT NULL,
  client_name TEXT NOT NULL,
  notification_channel TEXT NOT NULL,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('sent', 'failed', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE irs_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitored_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_log ENABLE ROW LEVEL SECURITY;

-- irs_connections
CREATE POLICY irs_connections_select_own ON irs_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY irs_connections_insert_own ON irs_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY irs_connections_update_own ON irs_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY irs_connections_delete_own ON irs_connections FOR DELETE USING (auth.uid() = user_id);

-- monitored_clients
CREATE POLICY monitored_clients_select_own ON monitored_clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY monitored_clients_insert_own ON monitored_clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY monitored_clients_update_own ON monitored_clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY monitored_clients_delete_own ON monitored_clients FOR DELETE USING (auth.uid() = user_id);

-- transcript_snapshots
CREATE POLICY transcript_snapshots_select_own ON transcript_snapshots FOR SELECT 
  USING (monitored_client_id IN (SELECT id FROM monitored_clients WHERE user_id = auth.uid()));
CREATE POLICY transcript_snapshots_insert_own ON transcript_snapshots FOR INSERT 
  WITH CHECK (monitored_client_id IN (SELECT id FROM monitored_clients WHERE user_id = auth.uid()));

-- alert_preferences
CREATE POLICY alert_preferences_select_own ON alert_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY alert_preferences_insert_own ON alert_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY alert_preferences_update_own ON alert_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY alert_preferences_delete_own ON alert_preferences FOR DELETE USING (auth.uid() = user_id);

-- alert_log
CREATE POLICY alert_log_select_own ON alert_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY alert_log_insert_own ON alert_log FOR INSERT WITH CHECK (auth.uid() = user_id);
