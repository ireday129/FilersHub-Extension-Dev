-- ============================================================
-- IRS Alerts Add-on Migration
-- Adds is_addon flag to tier map and pending subscriptions,
-- and tracks add-on subscription ID on firms.
-- ============================================================

-- Add is_addon flag to stripe_tier_map
ALTER TABLE stripe_tier_map ADD COLUMN IF NOT EXISTS is_addon BOOLEAN DEFAULT FALSE;
UPDATE stripe_tier_map SET is_addon = TRUE WHERE plan_tier = 'IRS Alerts';

-- Add is_addon flag to pending_subscriptions (for linking flow)
ALTER TABLE pending_subscriptions ADD COLUMN IF NOT EXISTS is_addon BOOLEAN DEFAULT FALSE;

-- Track add-on subscription ID separately on firms
-- (stripe_subscription_id holds the base plan; this holds the IRS Alerts add-on)
ALTER TABLE firms ADD COLUMN IF NOT EXISTS irs_addon_subscription_id TEXT;

-- Change default subscription_status from 'active' to 'trialing'
-- so new installs without a paid subscription are blocked until linked
ALTER TABLE firms ALTER COLUMN subscription_status SET DEFAULT 'trialing';
