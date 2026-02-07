-- ============================================================
-- Fix: Grant table permissions to authenticated/anon roles
-- These tables were created in migration 2 but may lack explicit GRANTs
-- ============================================================

GRANT ALL ON widgets TO authenticated;
GRANT SELECT ON widgets TO anon;

GRANT ALL ON integrations TO authenticated;
GRANT ALL ON contacts TO authenticated;
GRANT ALL ON phone_numbers TO authenticated;
GRANT ALL ON campaign_groups TO authenticated;
GRANT ALL ON campaign_contacts TO authenticated;
GRANT ALL ON appointments TO authenticated;
GRANT ALL ON support_tickets TO authenticated;
GRANT ALL ON ticket_comments TO authenticated;
GRANT ALL ON sms_templates TO authenticated;
GRANT ALL ON sms_history TO authenticated;
GRANT SELECT ON billing_events TO authenticated;
GRANT ALL ON knowledge_base_items TO authenticated;
GRANT ALL ON profiles TO authenticated;
