-- Migration: Agent Support
-- Ajouter le type 'support' et la table de configuration

-- 1. Mettre a jour le CHECK constraint de agent_type
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN ('standard', 'rdv', 'support'));

-- 2. Ajouter case_number au format SAV-YYYYMMDD-XXXXX sur support_tickets
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS case_number TEXT UNIQUE;

-- 3. Table de configuration pour l'agent support
CREATE TABLE IF NOT EXISTS agent_support_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES auth.users(id),

  -- Transfert d'appel
  transfer_enabled BOOLEAN DEFAULT false,
  default_transfer_number TEXT,

  -- Notifications
  sms_enabled BOOLEAN DEFAULT false,
  email_enabled BOOLEAN DEFAULT false,

  -- Tickets
  default_priority TEXT DEFAULT 'medium',
  default_category TEXT DEFAULT 'general',

  -- Secret webhook
  webhook_secret TEXT DEFAULT gen_random_uuid()::TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE agent_support_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own support config' AND tablename = 'agent_support_config') THEN
    CREATE POLICY "Users manage own support config"
      ON agent_support_config FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;
