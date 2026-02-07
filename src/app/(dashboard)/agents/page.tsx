"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import AgentList from "@/components/agents/AgentList";
import CreateAgentModal from "@/components/agents/CreateAgentModal";
import { listAgents, deleteAgent } from "@/lib/elevenlabs";
import type { Agent, CreateAgentFormData } from "@/types/elevenlabs";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAgents();
      setAgents(data.agents || []);
    } catch {
      toast.error("Impossible de charger les agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleDelete = async (agentId: string) => {
    try {
      await deleteAgent(agentId);
      toast.success("Agent supprime avec succes");
      fetchAgents();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleCreated = () => {
    setShowCreateModal(false);
    toast.success("Agent cree avec succes !");
    fetchAgents();
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
  };

  const handleEditDone = () => {
    setEditingAgent(null);
    toast.success("Agent mis a jour !");
    fetchAgents();
  };

  const getEditData = (agent: Agent): Partial<CreateAgentFormData> => {
    const config = agent.conversation_config;
    return {
      name: agent.name,
      systemPrompt: config?.agent?.prompt?.prompt || "",
      firstMessage: config?.agent?.first_message || "",
      language: config?.agent?.language || "fr",
      voiceId: config?.tts?.voice_id || "",
      llmModel: config?.agent?.prompt?.llm || "gpt-4o-mini",
      temperature: config?.agent?.prompt?.temperature ?? 0.7,
      maxDurationSeconds: config?.conversation?.max_duration_seconds ?? 600,
      stability: config?.tts?.stability ?? 0.5,
      similarityBoost: config?.tts?.similarity_boost ?? 0.8,
      speed: config?.tts?.speed ?? 1.0,
    };
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>Mes Agents Vocaux</h1>
          <p style={{ color: "#6b7280", marginTop: "0.25rem", fontSize: "0.875rem" }}>
            Creez, gerez et testez vos agents conversationnels
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={fetchAgents} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <RefreshCw style={{ height: "1rem", width: "1rem" }} />
            Actualiser
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Plus style={{ height: "1rem", width: "1rem" }} />
            Nouvel Agent
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}>
          <div style={{
            width: "2rem",
            height: "2rem",
            border: "4px solid #FFEDD5",
            borderTopColor: "#F97316",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }} />
        </div>
      ) : (
        <AgentList agents={agents} onDelete={handleDelete} onEdit={handleEdit} />
      )}

      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {editingAgent && (
        <CreateAgentModal
          onClose={() => setEditingAgent(null)}
          onCreated={handleEditDone}
          editMode
          agentId={editingAgent.agent_id}
          initialData={getEditData(editingAgent)}
        />
      )}
    </div>
  );
}
