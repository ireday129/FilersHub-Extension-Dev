-- Support Ticketing System Migration
-- Creates support_tickets and ticket_messages tables

CREATE TABLE support_tickets (
  ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(firm_id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'received',
  submitted_by_email TEXT NOT NULL,
  submitted_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_firm_id ON support_tickets(firm_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at DESC);

CREATE TABLE ticket_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(ticket_id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created_at ON ticket_messages(created_at);

-- Track when the firm owner last read each ticket (for "new response" badge)
ALTER TABLE support_tickets ADD COLUMN firm_last_read_at TIMESTAMPTZ;
