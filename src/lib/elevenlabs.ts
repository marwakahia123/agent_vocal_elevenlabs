import { createClient } from "@/lib/supabase/client";
import type { VoicesResponse, AgentsListResponse, Agent, SignedUrlResponse, DbConversation, ConversationsListResponse } from "@/types/elevenlabs";
import type { KnowledgeBaseItem } from "@/types/database";

function getSupabase() {
  return createClient();
}

async function invokeFunction<T>(functionName: string, body?: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: body ?? {},
  });

  if (error) {
    throw new Error(error.message || `Error calling ${functionName}`);
  }

  return data as T;
}

export async function listVoices(): Promise<VoicesResponse> {
  return invokeFunction<VoicesResponse>("list-voices");
}

export async function listAgents(): Promise<AgentsListResponse> {
  return invokeFunction<AgentsListResponse>("list-agents");
}

export async function getAgent(agentId: string): Promise<Agent> {
  return invokeFunction<Agent>("get-agent", { agentId });
}

export async function createAgent(formData: Record<string, unknown>): Promise<{ agent_id: string }> {
  return invokeFunction<{ agent_id: string }>("create-agent", formData);
}

export async function deleteAgent(agentId: string): Promise<{ success: boolean }> {
  return invokeFunction<{ success: boolean }>("delete-agent", { agentId });
}

export async function updateAgent(agentId: string, formData: Record<string, unknown>): Promise<Agent> {
  return invokeFunction<Agent>("update-agent", { agentId, ...formData });
}

export async function getSignedUrl(agentId: string): Promise<SignedUrlResponse> {
  return invokeFunction<SignedUrlResponse>("get-signed-url", { agentId });
}

// RDV Agent
export async function createRdvAgent(formData: Record<string, unknown>): Promise<{ agent_id: string }> {
  return invokeFunction<{ agent_id: string }>("create-rdv-agent", formData);
}

// RDV Agent update
export async function updateRdvAgent(agentId: string, formData: Record<string, unknown>): Promise<Agent> {
  return invokeFunction<Agent>("update-rdv-agent", { agentId, ...formData });
}

// Support Agent
export async function createSupportAgent(formData: Record<string, unknown>): Promise<{ agent_id: string }> {
  return invokeFunction<{ agent_id: string }>("create-support-agent", formData);
}

export async function updateSupportAgent(agentId: string, formData: Record<string, unknown>): Promise<Agent> {
  return invokeFunction<Agent>("update-support-agent", { agentId, ...formData });
}

// Conversations
export async function startConversation(elevenlabsAgentId: string): Promise<DbConversation> {
  return invokeFunction<DbConversation>("save-conversation", {
    action: "start",
    elevenlabsAgentId,
  });
}

export async function endConversation(conversationId: string): Promise<DbConversation> {
  return invokeFunction<DbConversation>("save-conversation", {
    action: "end",
    conversationId,
  });
}

export async function saveMessage(conversationId: string, source: "user" | "ai", content: string) {
  return invokeFunction("save-message", { conversationId, source, content });
}

export async function listConversations(elevenlabsAgentId?: string): Promise<ConversationsListResponse> {
  return invokeFunction<ConversationsListResponse>("list-conversations", {
    elevenlabsAgentId,
  });
}

// Campaigns
export async function startCampaign(campaignId: string) {
  return invokeFunction("campaign-outbound-call", { action: "start", campaign_id: campaignId });
}

export async function pauseCampaign(campaignId: string) {
  return invokeFunction("campaign-outbound-call", { action: "pause", campaign_id: campaignId });
}

export async function resumeCampaign(campaignId: string) {
  return invokeFunction("campaign-outbound-call", { action: "resume", campaign_id: campaignId });
}

// Outbound call (single contact)
export async function makeOutboundCall(elevenlabsAgentId: string, agentId: string, toNumber: string) {
  return invokeFunction<{ ok: boolean; conversation_id: string | null }>("outbound-call", {
    elevenlabs_agent_id: elevenlabsAgentId,
    agent_id: agentId,
    to_number: toNumber,
  });
}

// Knowledge Base
export async function uploadKnowledgeBase(
  agentId: string,
  file?: File,
  url?: string
): Promise<KnowledgeBaseItem> {
  const supabase = getSupabase();
  const formData = new FormData();
  formData.append("agentId", agentId);
  if (file) formData.append("file", file);
  if (url) formData.append("url", url);

  const { data, error } = await supabase.functions.invoke("upload-knowledge-base", {
    body: formData,
  });
  if (error) throw new Error(error.message || "Erreur upload knowledge base");
  return data as KnowledgeBaseItem;
}

export async function listKnowledgeBaseItems(agentId: string): Promise<KnowledgeBaseItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("knowledge_base_items")
    .select("*")
    .eq("elevenlabs_agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as KnowledgeBaseItem[]) || [];
}

export async function deleteKnowledgeBaseItem(itemId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("knowledge_base_items")
    .delete()
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

// Integrations
export async function getGoogleAuthUrl(): Promise<{ url: string }> {
  return invokeFunction<{ url: string }>("google-auth-url");
}

export async function getMicrosoftAuthUrl(): Promise<{ url: string }> {
  return invokeFunction<{ url: string }>("microsoft-auth-url");
}

export async function sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean }> {
  return invokeFunction<{ success: boolean }>("send-email", { to, subject, body });
}

export async function syncCalendar(action: "list" | "create", event?: Record<string, unknown>) {
  return invokeFunction("sync-calendar", { action, event });
}
