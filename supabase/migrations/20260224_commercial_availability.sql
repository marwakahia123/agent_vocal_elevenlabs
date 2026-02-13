-- Migration: Ajouter les colonnes de disponibilite a agent_commercial_config
ALTER TABLE agent_commercial_config
  ADD COLUMN IF NOT EXISTS availability_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS working_days TEXT[] DEFAULT '{lun,mar,mer,jeu,ven}',
  ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS breaks JSONB DEFAULT '[{"start":"12:00","end":"14:00"}]',
  ADD COLUMN IF NOT EXISTS min_delay_hours INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_horizon_days INTEGER DEFAULT 30;
