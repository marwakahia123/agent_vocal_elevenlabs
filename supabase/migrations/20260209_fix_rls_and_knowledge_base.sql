-- ============================================================
-- Migration: Fix RLS policies + Knowledge Base table
-- ============================================================

-- 1. DEFENSIVE: Drop old permissive policies (idempotent)
DROP POLICY IF EXISTS "Allow all on agents" ON agents;
DROP POLICY IF EXISTS "Allow all on conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all on messages" ON messages;

-- 2. Ensure user_id columns exist and are NOT NULL for new rows
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. Fix conversation status constraint to include all used values
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('active', 'ended', 'error', 'completed', 'missed', 'failed', 'in_progress'));

-- 4. Recreate agent policies (DROP IF EXISTS + CREATE for idempotency)
DROP POLICY IF EXISTS "Users can view own agents" ON agents;
DROP POLICY IF EXISTS "Users can insert own agents" ON agents;
DROP POLICY IF EXISTS "Users can update own agents" ON agents;
DROP POLICY IF EXISTS "Users can delete own agents" ON agents;
DROP POLICY IF EXISTS "Service role full access agents" ON agents;

CREATE POLICY "Users can view own agents" ON agents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own agents" ON agents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agents" ON agents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agents" ON agents FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access agents" ON agents FOR ALL USING (auth.role() = 'service_role');

-- 5. Recreate conversation policies
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;
DROP POLICY IF EXISTS "Service role full access conversations" ON conversations;

CREATE POLICY "Users can view own conversations" ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access conversations" ON conversations FOR ALL USING (auth.role() = 'service_role');

-- 6. Recreate message policies
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
DROP POLICY IF EXISTS "Service role full access messages" ON messages;

CREATE POLICY "Users can view own messages" ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert own messages" ON messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Service role full access messages" ON messages FOR ALL USING (auth.role() = 'service_role');

-- 7. KNOWLEDGE BASE ITEMS table
CREATE TABLE IF NOT EXISTS knowledge_base_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  elevenlabs_agent_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'txt', 'url')),
  file_size_bytes INTEGER,
  elevenlabs_doc_id TEXT,
  status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_items_agent_id ON knowledge_base_items(agent_id);
CREATE INDEX IF NOT EXISTS idx_kb_items_user_id ON knowledge_base_items(user_id);

ALTER TABLE knowledge_base_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own KB items" ON knowledge_base_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access kb" ON knowledge_base_items
  FOR ALL USING (auth.role() = 'service_role');
