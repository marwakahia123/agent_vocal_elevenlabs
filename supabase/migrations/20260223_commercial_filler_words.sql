-- Migration: Ajouter filler_words a agent_commercial_config
ALTER TABLE agent_commercial_config
  ADD COLUMN IF NOT EXISTS filler_words TEXT[] DEFAULT '{}';
