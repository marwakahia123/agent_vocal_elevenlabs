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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Mes Agents Vocaux</h1>
          <p className="text-sm text-slate-500 mt-1">
            Creez, gerez et testez vos agents conversationnels
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchAgents} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nouvel Agent
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
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
