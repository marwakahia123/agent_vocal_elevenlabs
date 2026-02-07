-- ============================================================
-- HallCall SaaS - Migration: Add auth, multi-tenant, all tables
-- ============================================================

-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. PROFILES (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  minutes_used INTEGER DEFAULT 0,
  minutes_limit INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. VERIFICATION CODES
CREATE TABLE IF NOT EXISTS signup_verification_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  hashed_password TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ADD user_id TO EXISTING TABLES
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS caller_phone TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS call_type TEXT DEFAULT 'inbound' CHECK (call_type IN ('inbound', 'outbound', 'widget', 'test'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS cost_euros REAL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS satisfaction_score INTEGER CHECK (satisfaction_score IS NULL OR (satisfaction_score >= 1 AND satisfaction_score <= 5));

-- 4. PHONE NUMBERS
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  label TEXT DEFAULT '',
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  provider TEXT DEFAULT 'twilio',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. WIDGETS
CREATE TABLE IF NOT EXISTS widgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  embed_token TEXT UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  config JSONB DEFAULT '{
    "position": "bottom-right",
    "primaryColor": "#F97316",
    "greeting": "Bonjour ! Comment puis-je vous aider ?",
    "width": 380,
    "height": 600
  }'::jsonb,
  domain_whitelist TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. INTEGRATIONS (OAuth tokens)
CREATE TABLE IF NOT EXISTS integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'smtp')),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- 7. CONTACTS (CRM)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  company TEXT,
  city TEXT,
  country TEXT DEFAULT 'FR',
  tags TEXT[] DEFAULT '{}',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'widget', 'campaign')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. CAMPAIGN GROUPS
CREATE TABLE IF NOT EXISTS campaign_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_contacts INTEGER DEFAULT 0,
  contacts_called INTEGER DEFAULT 0,
  contacts_answered INTEGER DEFAULT 0,
  contacts_failed INTEGER DEFAULT 0,
  budget_euros REAL,
  cost_euros REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. CAMPAIGN CONTACTS (junction)
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaign_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'answered', 'no_answer', 'busy', 'failed', 'completed')),
  call_duration_seconds INTEGER,
  called_at TIMESTAMPTZ,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);

-- 10. APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  location TEXT DEFAULT '',
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
  external_calendar_id TEXT,
  external_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11. SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_number SERIAL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'technical', 'billing', 'feature_request', 'bug')),
  assigned_to TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. TICKET COMMENTS
CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. SMS TEMPLATES
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 14. SMS HISTORY
CREATE TABLE IF NOT EXISTS sms_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  phone_to TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  error_message TEXT
);

-- 15. BILLING EVENTS
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('subscription_start', 'subscription_renewal', 'subscription_cancel', 'plan_change', 'overage_charge', 'credit_purchase')),
  amount_euros REAL DEFAULT 0,
  description TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_call_type ON conversations(call_type);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id ON phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_widgets_user_id ON widgets(user_id);
CREATE INDEX IF NOT EXISTS idx_widgets_embed_token ON widgets(embed_token);
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_campaign_groups_user_id ON campaign_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_at ON appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_user_id ON sms_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_history_user_id ON sms_history(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_user_id ON billing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_signup_codes_email ON signup_verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_reset_codes_email ON password_reset_codes(email);

-- ============================================================
-- RLS POLICIES (Multi-tenant isolation)
-- ============================================================

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow all on agents" ON agents;
DROP POLICY IF EXISTS "Allow all on conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all on messages" ON messages;

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role full access profiles" ON profiles FOR ALL USING (auth.role() = 'service_role');

-- AGENTS
CREATE POLICY "Users can view own agents" ON agents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own agents" ON agents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agents" ON agents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agents" ON agents FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access agents" ON agents FOR ALL USING (auth.role() = 'service_role');

-- CONVERSATIONS
CREATE POLICY "Users can view own conversations" ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access conversations" ON conversations FOR ALL USING (auth.role() = 'service_role');

-- MESSAGES (via conversation user_id)
CREATE POLICY "Users can view own messages" ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert own messages" ON messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Service role full access messages" ON messages FOR ALL USING (auth.role() = 'service_role');

-- PHONE NUMBERS
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own phone numbers" ON phone_numbers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access phone_numbers" ON phone_numbers FOR ALL USING (auth.role() = 'service_role');

-- WIDGETS
ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own widgets" ON widgets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can view active widgets by token" ON widgets FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access widgets" ON widgets FOR ALL USING (auth.role() = 'service_role');

-- INTEGRATIONS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own integrations" ON integrations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access integrations" ON integrations FOR ALL USING (auth.role() = 'service_role');

-- CONTACTS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own contacts" ON contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access contacts" ON contacts FOR ALL USING (auth.role() = 'service_role');

-- CAMPAIGN GROUPS
ALTER TABLE campaign_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own campaigns" ON campaign_groups FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access campaign_groups" ON campaign_groups FOR ALL USING (auth.role() = 'service_role');

-- CAMPAIGN CONTACTS
ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own campaign contacts" ON campaign_contacts FOR ALL
  USING (EXISTS (SELECT 1 FROM campaign_groups cg WHERE cg.id = campaign_contacts.campaign_id AND cg.user_id = auth.uid()));
CREATE POLICY "Service role full access campaign_contacts" ON campaign_contacts FOR ALL USING (auth.role() = 'service_role');

-- APPOINTMENTS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own appointments" ON appointments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access appointments" ON appointments FOR ALL USING (auth.role() = 'service_role');

-- SUPPORT TICKETS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tickets" ON support_tickets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access support_tickets" ON support_tickets FOR ALL USING (auth.role() = 'service_role');

-- TICKET COMMENTS
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ticket comments" ON ticket_comments FOR SELECT
  USING (EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_comments.ticket_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can add comments to own tickets" ON ticket_comments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_comments.ticket_id AND t.user_id = auth.uid()));
CREATE POLICY "Service role full access ticket_comments" ON ticket_comments FOR ALL USING (auth.role() = 'service_role');

-- SMS TEMPLATES
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sms templates" ON sms_templates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access sms_templates" ON sms_templates FOR ALL USING (auth.role() = 'service_role');

-- SMS HISTORY
ALTER TABLE sms_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sms history" ON sms_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access sms_history" ON sms_history FOR ALL USING (auth.role() = 'service_role');

-- BILLING EVENTS
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own billing" ON billing_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access billing_events" ON billing_events FOR ALL USING (auth.role() = 'service_role');

-- SIGNUP VERIFICATION CODES (service_role only)
ALTER TABLE signup_verification_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access signup_codes" ON signup_verification_codes FOR ALL USING (auth.role() = 'service_role');

-- PASSWORD RESET CODES (service_role only)
ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access reset_codes" ON password_reset_codes FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- UPDATED_AT TRIGGERS for new tables
-- ============================================================
CREATE OR REPLACE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER phone_numbers_updated_at BEFORE UPDATE ON phone_numbers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER widgets_updated_at BEFORE UPDATE ON widgets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER campaign_groups_updated_at BEFORE UPDATE ON campaign_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER support_tickets_updated_at BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER sms_templates_updated_at BEFORE UPDATE ON sms_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
