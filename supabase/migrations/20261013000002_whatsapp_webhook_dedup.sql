-- Migration: WhatsApp Webhook Message Deduplication
-- Description: Prevents duplicate processing of webhook messages

CREATE TABLE IF NOT EXISTS whatsapp_webhook_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_message_id TEXT NOT NULL UNIQUE,
  from_number TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chk_whatsapp_message_id_format CHECK (length(whatsapp_message_id) > 0)
);

-- Index for fast duplicate checks
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_webhook_message_id 
ON whatsapp_webhook_messages(whatsapp_message_id);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_received_at 
ON whatsapp_webhook_messages(received_at);

COMMENT ON TABLE whatsapp_webhook_messages IS 'Tracks received WhatsApp webhook messages to prevent duplicate processing';
COMMENT ON COLUMN whatsapp_webhook_messages.whatsapp_message_id IS 'Meta WhatsApp message ID (globally unique)';
COMMENT ON COLUMN whatsapp_webhook_messages.from_number IS 'Sender phone number (digits only, no PII in logs)';

-- Enable RLS
ALTER TABLE whatsapp_webhook_messages ENABLE ROW LEVEL SECURITY;

-- Service role only (webhook handler)
CREATE POLICY "Service role full access to webhook messages"
ON whatsapp_webhook_messages
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- Cleanup function: delete messages older than 7 days
CREATE OR REPLACE FUNCTION cleanup_old_webhook_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM whatsapp_webhook_messages
  WHERE received_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_webhook_messages IS 'Deletes webhook message records older than 7 days';

GRANT EXECUTE ON FUNCTION cleanup_old_webhook_messages TO service_role;
