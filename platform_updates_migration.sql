-- =====================================================
-- PLATFORM UPDATES (Super Admin managed announcements)
-- =====================================================
CREATE TABLE platform_updates (
  update_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL DEFAULT 'update' CHECK (type IN ('update', 'deadline')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_platform_updates_active ON platform_updates(is_active, created_at DESC);

ALTER TABLE platform_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_updates_select_all ON platform_updates
  FOR SELECT USING (TRUE);

CREATE POLICY platform_updates_insert_authenticated ON platform_updates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY platform_updates_update_authenticated ON platform_updates
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY platform_updates_delete_authenticated ON platform_updates
  FOR DELETE USING (auth.uid() IS NOT NULL);
