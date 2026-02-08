-- ============================================================
-- Agent RDV Config : table de configuration pour agents prise de rendez-vous
-- ============================================================

-- 1. Ajouter colonne agent_type sur la table agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'standard';

-- 2. Table de configuration RDV
CREATE TABLE IF NOT EXISTS agent_rdv_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES auth.users(id),

  -- Horaires de disponibilite
  availability_enabled BOOLEAN DEFAULT true,
  working_days TEXT[] DEFAULT '{lun,mar,mer,jeu,ven}',
  start_time TEXT DEFAULT '09:00',
  end_time TEXT DEFAULT '17:00',
  slot_duration_minutes INT DEFAULT 20,
  breaks JSONB DEFAULT '[]',
  min_delay_hours INT DEFAULT 2,
  max_horizon_days INT DEFAULT 30,

  -- Transfert d'appel
  transfer_enabled BOOLEAN DEFAULT false,
  always_transfer BOOLEAN DEFAULT false,
  transfer_conditions JSONB DEFAULT '[]',
  default_transfer_number TEXT,

  -- Notifications
  sms_notification_enabled BOOLEAN DEFAULT false,
  email_notification_enabled BOOLEAN DEFAULT false,

  -- Secret pour webhook ElevenLabs
  webhook_secret TEXT DEFAULT gen_random_uuid()::TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Index et RLS
CREATE INDEX IF NOT EXISTS idx_agent_rdv_config_agent_id ON agent_rdv_config(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_rdv_config_user_id ON agent_rdv_config(user_id);

ALTER TABLE agent_rdv_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own rdv configs"
  ON agent_rdv_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypass
GRANT ALL ON agent_rdv_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_rdv_config TO authenticated;
