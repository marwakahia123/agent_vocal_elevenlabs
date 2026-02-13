-- Migration: Notification Templates
-- Systeme de templates unifie pour SMS et Email, applicable a tous les types d'agents

-- ============================================================
-- ROLLBACK :
-- DROP TABLE IF EXISTS notification_templates CASCADE;
-- ALTER TABLE agent_rdv_config DROP COLUMN IF EXISTS sms_template_id;
-- ALTER TABLE agent_rdv_config DROP COLUMN IF EXISTS email_template_id;
-- ALTER TABLE agent_support_config DROP COLUMN IF EXISTS sms_template_id;
-- ALTER TABLE agent_support_config DROP COLUMN IF EXISTS email_template_id;
-- ALTER TABLE agent_order_config DROP COLUMN IF EXISTS sms_template_id;
-- ALTER TABLE agent_order_config DROP COLUMN IF EXISTS email_template_id;
-- ============================================================

-- 1. Table notification_templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('rdv', 'support', 'order')),

  subject TEXT,                    -- Sujet email (NULL pour SMS)
  content TEXT NOT NULL,           -- Corps du message avec {{variables}}
  variables TEXT[] DEFAULT '{}',   -- Variables auto-extraites du contenu

  is_default BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_user_id ON notification_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_agent_type ON notification_templates(agent_type);

-- RLS notification_templates
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own notification templates' AND tablename = 'notification_templates') THEN
    CREATE POLICY "Users manage own notification templates"
      ON notification_templates FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access notification_templates' AND tablename = 'notification_templates') THEN
    CREATE POLICY "Service role full access notification_templates"
      ON notification_templates FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE TRIGGER notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Ajouter les FK template dans chaque agent config
ALTER TABLE agent_rdv_config
  ADD COLUMN IF NOT EXISTS sms_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL;

ALTER TABLE agent_support_config
  ADD COLUMN IF NOT EXISTS sms_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL;

ALTER TABLE agent_order_config
  ADD COLUMN IF NOT EXISTS sms_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL;

-- 3. Couleur du header email
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS header_color TEXT DEFAULT '#0f172a';

-- Grant access
GRANT ALL ON notification_templates TO authenticated;
GRANT ALL ON notification_templates TO service_role;
