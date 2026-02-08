"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, RefreshCw, Bot, Calendar, Headphones, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import AgentList from "@/components/agents/AgentList";
import CreateAgentModal from "@/components/agents/CreateAgentModal";
import CreateAppointmentAgentModal from "@/components/agents/CreateAppointmentAgentModal";
import CreateSupportAgentModal from "@/components/agents/CreateSupportAgentModal";
import { listAgents, deleteAgent } from "@/lib/elevenlabs";
import type { Agent, CreateAgentFormData } from "@/types/elevenlabs";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRdvModal, setShowRdvModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [editingRdvAgent, setEditingRdvAgent] = useState<Agent | null>(null);
  const [editingSupportAgent, setEditingSupportAgent] = useState<Agent | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowTypeMenu(false);
      }
    };
    if (showTypeMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTypeMenu]);

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
    setShowRdvModal(false);
    setShowSupportModal(false);
    toast.success("Agent cree avec succes !");
    fetchAgents();
  };

  const handleEdit = (agent: Agent) => {
    const type = agent.agent_type || "standard";
    if (type === "support") {
      setEditingSupportAgent(agent);
    } else if (type === "rdv") {
      setEditingRdvAgent(agent);
    } else {
      setEditingAgent(agent);
    }
  };

  const handleEditDone = () => {
    setEditingAgent(null);
    setEditingRdvAgent(null);
    setEditingSupportAgent(null);
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

          {/* Dropdown for agent type selection */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowTypeMenu(!showTypeMenu)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Nouvel Agent
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </button>

            {showTypeMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                <button
                  onClick={() => { setShowTypeMenu(false); setShowCreateModal(true); }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={18} className="text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Agent Standard</div>
                    <div className="text-xs text-slate-500 mt-0.5">Agent vocal conversationnel classique</div>
                  </div>
                </button>
                <div className="border-t border-slate-100" />
                <button
                  onClick={() => { setShowTypeMenu(false); setShowRdvModal(true); }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Calendar size={18} className="text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Agent Prise de Rendez-vous</div>
                    <div className="text-xs text-slate-500 mt-0.5">Agent specialise pour la reservation de creneaux</div>
                  </div>
                </button>
                <div className="border-t border-slate-100" />
                <button
                  onClick={() => { setShowTypeMenu(false); setShowSupportModal(true); }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Headphones size={18} className="text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Agent Support</div>
                    <div className="text-xs text-slate-500 mt-0.5">Agent specialise pour le service client et SAV</div>
                  </div>
                </button>
              </div>
            )}
          </div>
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

      {showRdvModal && (
        <CreateAppointmentAgentModal
          onClose={() => setShowRdvModal(false)}
          onCreated={handleCreated}
        />
      )}

      {showSupportModal && (
        <CreateSupportAgentModal
          onClose={() => setShowSupportModal(false)}
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

      {editingRdvAgent && (
        <CreateAppointmentAgentModal
          onClose={() => setEditingRdvAgent(null)}
          onCreated={handleEditDone}
          editMode
          agentId={editingRdvAgent.agent_id}
          initialData={getEditData(editingRdvAgent)}
        />
      )}

      {editingSupportAgent && (
        <CreateSupportAgentModal
          onClose={() => setEditingSupportAgent(null)}
          onCreated={handleEditDone}
          editMode
          agentId={editingSupportAgent.agent_id}
          initialData={getEditData(editingSupportAgent)}
        />
      )}
    </div>
  );
}
