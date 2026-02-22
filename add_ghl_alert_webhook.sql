-- Add GHL Alert Webhook URL to firms table
ALTER TABLE firms ADD COLUMN IF NOT EXISTS ghl_alert_webhook_url TEXT;

-- Update schema.sql as well for documentation purposes
