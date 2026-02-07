export interface Voice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string | null;
}

export interface VoicesResponse {
  voices: Voice[];
  has_more: boolean;
  total_count: number;
}

export interface AgentPrompt {
  prompt: string;
  llm: string;
  temperature: number;
  max_tokens: number;
}

export interface AgentConfig {
  first_message: string;
  language: string;
  prompt: AgentPrompt;
}

export interface TtsConfig {
  voice_id: string;
  model_id: string;
  stability: number;
  similarity_boost: number;
  speed: number;
}

export interface ConversationConfig {
  agent: AgentConfig;
  tts: TtsConfig;
  conversation?: {
    max_duration_seconds: number;
  };
}

export interface Agent {
  agent_id: string;
  name: string;
  conversation_config: ConversationConfig;
  created_at_unix_secs?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentsListResponse {
  agents: Agent[];
  has_more: boolean;
  total_count: number;
}

export interface CreateAgentFormData {
  name: string;
  systemPrompt: string;
  firstMessage: string;
  language: string;
  voiceId: string;
  llmModel: string;
  temperature: number;
  maxDurationSeconds: number;
  stability: number;
  similarityBoost: number;
  speed: number;
}

export interface SignedUrlResponse {
  signed_url: string;
}

// Types pour la base de donnees
export interface DbConversation {
  id: string;
  elevenlabs_agent_id: string;
  elevenlabs_conversation_id: string | null;
  status: "active" | "ended" | "error";
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  call_type: "inbound" | "outbound" | "widget" | "test" | null;
  caller_phone: string | null;
  messages: DbMessage[];
}

export interface DbMessage {
  id: string;
  source: "user" | "ai";
  content: string;
  created_at: string;
}

export interface ConversationsListResponse {
  conversations: DbConversation[];
}
