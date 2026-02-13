-- Migration: Agent Commercial (Prospection)
-- Ajouter le type 'commercial' et les tables de configuration + leads

-- ============================================================
-- ROLLBACK (executer ces commandes pour annuler la migration) :
-- DROP TABLE IF EXISTS leads CASCADE;
-- DROP TABLE IF EXISTS agent_commercial_config CASCADE;
-- ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
-- ALTER TABLE agents ADD CONSTRAINT agents_agent_type_check
--   CHECK (agent_type IN ('standard', 'rdv', 'support', 'order'));
-- ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_agent_type_check;
-- ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_agent_type_check
--   CHECK (agent_type IN ('rdv', 'support', 'order'));
-- DELETE FROM agents WHERE agent_type = 'commercial';
-- ============================================================

-- 1. Mettre a jour le CHECK constraint de agent_type
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN ('standard', 'rdv', 'support', 'order', 'commercial'));

-- 2. Mettre a jour le CHECK constraint de notification_templates
ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_agent_type_check;
ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_agent_type_check
  CHECK (agent_type IN ('rdv', 'support', 'order', 'commercial'));

-- 3. Table de configuration pour l'agent commercial
CREATE TABLE IF NOT EXISTS agent_commercial_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES auth.users(id),

  -- Champs specifiques commercial
  product_name TEXT,
  product_description TEXT,
  sales_pitch TEXT,
  objection_handling TEXT,

  -- Transfert d'appel
  transfer_enabled BOOLEAN DEFAULT false,
  always_transfer BOOLEAN DEFAULT false,
  transfer_conditions JSONB DEFAULT '[]',
  default_transfer_number TEXT,

  -- Notifications
  sms_enabled BOOLEAN DEFAULT false,
  email_enabled BOOLEAN DEFAULT false,
  sms_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  email_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,

  -- Secret webhook
  webhook_secret TEXT DEFAULT gen_random_uuid()::TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS agent_commercial_config
ALTER TABLE agent_commercial_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own commercial config' AND tablename = 'agent_commercial_config') THEN
    CREATE POLICY "Users manage own commercial config"
      ON agent_commercial_config FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Table des leads (qualification prospects)
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  campaign_contact_id UUID REFERENCES campaign_contacts(id) ON DELETE SET NULL,

  -- Qualification
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'interested', 'not_interested', 'callback', 'transferred', 'converted')),
  interest_level INTEGER CHECK (interest_level BETWEEN 1 AND 5),

  -- Suivi
  notes TEXT,
  callback_date TIMESTAMPTZ,
  appointment_date TIMESTAMPTZ,

  -- Infos contact denormalisees
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  contact_company TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_contact_id ON leads(campaign_contact_id);

-- RLS leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own leads' AND tablename = 'leads') THEN
    CREATE POLICY "Users manage own leads"
      ON leads FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Grants
GRANT ALL ON agent_commercial_config TO authenticated;
GRANT ALL ON agent_commercial_config TO service_role;
GRANT ALL ON leads TO authenticated;
GRANT ALL ON leads TO service_role;
