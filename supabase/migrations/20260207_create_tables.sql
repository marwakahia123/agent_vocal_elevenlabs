-- Table des agents
CREATE TABLE IF NOT EXISTS agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  elevenlabs_agent_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  system_prompt TEXT DEFAULT '',
  first_message TEXT DEFAULT '',
  language TEXT DEFAULT 'fr',
  voice_id TEXT,
  llm_model TEXT DEFAULT 'gpt-4o-mini',
  temperature REAL DEFAULT 0.7,
  stability REAL DEFAULT 0.5,
  similarity_boost REAL DEFAULT 0.8,
  speed REAL DEFAULT 1.0,
  max_duration_seconds INTEGER DEFAULT 600,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table des conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  elevenlabs_agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended', 'error')),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER
);

-- Table des messages (transcript)
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('user', 'ai')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour accelerer les requetes frequentes
CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON conversations(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agents_elevenlabs_id ON agents(elevenlabs_agent_id);

-- Trigger pour mettre a jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Activer RLS (Row Level Security) - desactive pour simplifier (pas d'auth utilisateur)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Politique permissive (pas d'auth utilisateur dans ce projet)
CREATE POLICY "Allow all on agents" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on conversations" ON conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on messages" ON messages FOR ALL USING (true) WITH CHECK (true);
