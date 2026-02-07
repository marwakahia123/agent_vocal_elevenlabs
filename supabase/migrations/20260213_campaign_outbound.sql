-- Add outbound call tracking columns to campaign_contacts
ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS cost_euros REAL DEFAULT 0;

-- Index for faster lookup of pending contacts in a campaign
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(campaign_id, status);
