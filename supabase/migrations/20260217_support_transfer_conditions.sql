-- Migration: Add transfer conditions to agent_support_config
-- Aligns support agent transfer config with RDV agent

ALTER TABLE agent_support_config ADD COLUMN IF NOT EXISTS always_transfer BOOLEAN DEFAULT false;
ALTER TABLE agent_support_config ADD COLUMN IF NOT EXISTS transfer_conditions JSONB DEFAULT '[]'::jsonb;
