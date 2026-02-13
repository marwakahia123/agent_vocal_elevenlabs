-- Migration: Ajouter le champ meeting_link a agent_commercial_config
ALTER TABLE agent_commercial_config
  ADD COLUMN IF NOT EXISTS meeting_link TEXT;
