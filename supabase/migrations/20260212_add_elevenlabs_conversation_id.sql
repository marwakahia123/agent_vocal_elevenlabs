-- Add elevenlabs_conversation_id to conversations table for audio retrieval
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS elevenlabs_conversation_id TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_elevenlabs_conv_id ON conversations(elevenlabs_conversation_id);
