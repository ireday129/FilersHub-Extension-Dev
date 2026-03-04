-- ============================================================
-- Stripe Integration Migration
-- Creates tables for webhook processing, pending subscriptions,
-- and tier mapping.
-- ============================================================

-- A. Pending Subscriptions
-- Holds Stripe subscription data that arrives BEFORE the firm
-- is created (payment before app installation).
CREATE TABLE IF NOT EXISTS pending_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'Core'
    CHECK (plan_tier IN ('Core', 'Pro', 'IRS Alerts')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at TIMESTAMP WITH TIME ZONE,
  linked_firm_id UUID REFERENCES firms(firm_id),
  linked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_subs_email ON pending_subscriptions(customer_email);
CREATE INDEX IF NOT EXISTS idx_pending_subs_stripe_sub ON pending_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_pending_subs_unlinked ON pending_subscriptions(linked_firm_id) WHERE linked_firm_id IS NULL;

ALTER TABLE pending_subscriptions ENABLE ROW LEVEL SECURITY;
-- No public policies: only service_role (edge functions) accesses this table.


-- B. Stripe Webhook Events (idempotency log)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_webhook_events(stripe_event_id);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;


-- C. Stripe Tier Map
-- Maps Stripe price IDs to application subscription tiers.
-- Seed with your actual Stripe price IDs after creating products.
CREATE TABLE IF NOT EXISTS stripe_tier_map (
  stripe_price_id TEXT PRIMARY KEY,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('Core', 'Pro', 'IRS Alerts')),
  max_clients INTEGER NOT NULL DEFAULT 500,
  max_staff INTEGER NOT NULL DEFAULT 10
);

ALTER TABLE stripe_tier_map ENABLE ROW LEVEL SECURITY;

-- Fix CHECK constraints if tables already exist with old tier names
-- Must clear old data first so constraint doesn't fail on existing rows
ALTER TABLE stripe_tier_map DROP CONSTRAINT IF EXISTS stripe_tier_map_plan_tier_check;
TRUNCATE stripe_tier_map;
ALTER TABLE stripe_tier_map ADD CONSTRAINT stripe_tier_map_plan_tier_check
  CHECK (plan_tier IN ('Core', 'Pro', 'IRS Alerts'));

ALTER TABLE pending_subscriptions DROP CONSTRAINT IF EXISTS pending_subscriptions_plan_tier_check;
ALTER TABLE pending_subscriptions ALTER COLUMN plan_tier SET DEFAULT 'Core';
-- Update any existing pending rows before adding constraint
UPDATE pending_subscriptions SET plan_tier = 'Core' WHERE plan_tier NOT IN ('Core', 'Pro', 'IRS Alerts');
ALTER TABLE pending_subscriptions ADD CONSTRAINT pending_subscriptions_plan_tier_check
  CHECK (plan_tier IN ('Core', 'Pro', 'IRS Alerts'));

-- Seed with actual Stripe price IDs:
INSERT INTO stripe_tier_map (stripe_price_id, plan_tier, max_clients, max_staff) VALUES
  ('price_1T2KoqIs7aJOE5tUzH28EVNC', 'Core', 500, 10),
  ('price_1T2LvnIs7aJOE5tUA53o1dPa', 'Pro', 2000, 25),
  ('price_1T468HIs7aJOE5tUvcd2sXNy', 'IRS Alerts', 500, 10)
ON CONFLICT (stripe_price_id) DO UPDATE SET
  plan_tier = EXCLUDED.plan_tier,
  max_clients = EXCLUDED.max_clients,
  max_staff = EXCLUDED.max_staff;


-- D. Update existing tables to use new tier names

-- Update firms.subscription_tier default
ALTER TABLE firms ALTER COLUMN subscription_tier SET DEFAULT 'Core';

-- Drop and re-add CHECK constraint on subscriptions.plan_tier
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check;
ALTER TABLE subscriptions ALTER COLUMN plan_tier SET DEFAULT 'Core';
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_tier_check
  CHECK (plan_tier IN ('Core', 'Pro', 'IRS Alerts'));

-- Migrate any existing rows with old tier names
UPDATE firms SET subscription_tier = 'Core' WHERE subscription_tier = 'starter';
UPDATE firms SET subscription_tier = 'Pro' WHERE subscription_tier IN ('growth', 'enterprise');
UPDATE subscriptions SET plan_tier = 'Core' WHERE plan_tier = 'starter';
UPDATE subscriptions SET plan_tier = 'Pro' WHERE plan_tier IN ('growth', 'enterprise');


-- E. Add indexes on existing subscriptions table
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
