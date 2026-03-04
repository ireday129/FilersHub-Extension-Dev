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
  plan_tier TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan_tier IN ('starter', 'growth', 'enterprise')),
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

CREATE INDEX idx_pending_subs_email ON pending_subscriptions(customer_email);
CREATE INDEX idx_pending_subs_stripe_sub ON pending_subscriptions(stripe_subscription_id);
CREATE INDEX idx_pending_subs_unlinked ON pending_subscriptions(linked_firm_id) WHERE linked_firm_id IS NULL;

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

CREATE INDEX idx_stripe_events_event_id ON stripe_webhook_events(stripe_event_id);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;


-- C. Stripe Tier Map
-- Maps Stripe price IDs to application subscription tiers.
-- Seed with your actual Stripe price IDs after creating products.
CREATE TABLE IF NOT EXISTS stripe_tier_map (
  stripe_price_id TEXT PRIMARY KEY,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('starter', 'growth', 'enterprise')),
  max_clients INTEGER NOT NULL DEFAULT 500,
  max_staff INTEGER NOT NULL DEFAULT 10
);

ALTER TABLE stripe_tier_map ENABLE ROW LEVEL SECURITY;

-- Example seed (replace with your actual Stripe price IDs):
-- INSERT INTO stripe_tier_map (stripe_price_id, plan_tier, max_clients, max_staff) VALUES
--   ('price_xxxxxxxx_starter', 'starter', 500, 10),
--   ('price_xxxxxxxx_growth', 'growth', 2000, 25),
--   ('price_xxxxxxxx_enterprise', 'enterprise', 999999, 100);


-- D. Add indexes on existing subscriptions table
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
