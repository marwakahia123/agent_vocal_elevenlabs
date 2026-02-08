-- Add transfer tracking columns to conversations table
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS transferred_to TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS transfer_status TEXT CHECK (transfer_status IS NULL OR transfer_status IN ('success', 'failed'));
CREATE INDEX IF NOT EXISTS idx_conversations_twilio_call_sid ON conversations(twilio_call_sid);
