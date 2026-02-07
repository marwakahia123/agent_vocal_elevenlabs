"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Bot, Globe, MessageSquare, Edit2, FileText, Link2, Trash2, Upload, Loader2 } from "lucide-react";
import Link from "next/link";
import ConversationPanel from "@/components/conversation/ConversationPanel";
import ConversationHistory from "@/components/conversation/ConversationHistory";
import CreateAgentModal from "@/components/agents/CreateAgentModal";
import { getAgent, listKnowledgeBaseItems, uploadKnowledgeBase, deleteKnowledgeBaseItem } from "@/lib/elevenlabs";
import type { Agent, CreateAgentFormData } from "@/types/elevenlabs";
import type { KnowledgeBaseItem } from "@/types/database";

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [kbItems, setKbItems] = useState<KnowledgeBaseItem[]>([]);
  const [kbUploading, setKbUploading] = useState(false);

  const fetchAgent = useCallback(() => {
    setLoading(true);
    getAgent(agentId)
      .then((data) => setAgent(data))
      .catch(() => {
        toast.error("Agent introuvable");
        router.push("/agents");
      })
      .finally(() => setLoading(false));
  }, [agentId, router]);

  const fetchKbItems = useCallback(() => {
    listKnowledgeBaseItems(agentId)
      .then(setKbItems)
      .catch(() => {});
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
    fetchKbItems();
  }, [fetchAgent, fetchKbItems]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  if (!agent) return null;

  const config = agent.conversation_config;

  // Preparer les donnees initiales pour le formulaire d'edition
  const editData: Partial<CreateAgentFormData> = {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/agents"
          className="inline-flex items-center gap-2 text-sm text-slate-500 no-underline hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux agents
        </Link>
        <button
          onClick={() => setShowEditModal(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <Edit2 size={16} />
          Modifier
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="grid grid-cols-[1fr_2fr] gap-8">
          <div className="flex flex-col gap-6">
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-slate-100 p-3 rounded-lg">
                  <Bot className="h-8 w-8 text-slate-900" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 m-0">{agent.name}</h1>
                  <div className="flex items-center gap-1 text-sm text-slate-500">
                    <Globe className="h-3.5 w-3.5" />
                    <span>{config?.agent?.language?.toUpperCase() || "?"}</span>
                  </div>
                </div>
              </div>

              {config?.agent?.first_message && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    Premier message
                  </h3>
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                    <p className="m-0">{config.agent.first_message}</p>
                  </div>
                </div>
              )}

              {config?.agent?.prompt?.prompt && (
                <div className="border-t border-slate-100 pt-4 mt-4">
                  <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    Prompt systeme
                  </h3>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap m-0">
                    {config.agent.prompt.prompt}
                  </p>
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                Configuration technique
              </h3>
              <dl className="flex flex-col gap-2 text-sm m-0">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Agent ID</dt>
                  <dd className="font-mono text-xs text-slate-700 m-0">
                    {agent.agent_id.slice(0, 16)}...
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Modele LLM</dt>
                  <dd className="m-0">{config?.agent?.prompt?.llm || "?"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Voix ID</dt>
                  <dd className="font-mono text-xs text-slate-700 m-0">
                    {config?.tts?.voice_id ? config.tts.voice_id.slice(0, 16) + "..." : "?"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Knowledge Base */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide m-0">
                  Base de connaissances
                </h3>
                <label
                  className={`inline-flex items-center gap-1 text-xs text-slate-900 font-medium ${kbUploading ? "cursor-wait" : "cursor-pointer hover:text-slate-600"}`}
                >
                  {kbUploading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Upload size={12} />
                  )}
                  Ajouter
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    multiple
                    className="hidden"
                    disabled={kbUploading}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      setKbUploading(true);
                      for (const file of files) {
                        try {
                          await uploadKnowledgeBase(agentId, file);
                          toast.success(`${file.name} uploade`);
                        } catch {
                          toast.error(`Erreur: ${file.name}`);
                        }
                      }
                      setKbUploading(false);
                      fetchKbItems();
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {kbItems.length === 0 ? (
                <p className="text-[0.8125rem] text-slate-400 m-0">
                  Aucun document ajoute
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {kbItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-2 py-1.5 bg-slate-50 rounded-md text-[0.8125rem]"
                    >
                      <span className="flex items-center gap-1.5 overflow-hidden">
                        {item.file_type === "url" ? (
                          <Link2 size={14} className="text-slate-900 shrink-0" />
                        ) : (
                          <FileText size={14} className="text-slate-900 shrink-0" />
                        )}
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                          {item.file_name}
                        </span>
                        <span
                          className="text-[0.625rem] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: item.status === "ready" ? "#dcfce7" : item.status === "failed" ? "#fef2f2" : "#fef3c7",
                            color: item.status === "ready" ? "#15803d" : item.status === "failed" ? "#dc2626" : "#a16207",
                          }}
                        >
                          {item.status === "ready" ? "Pret" : item.status === "failed" ? "Erreur" : "En cours"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteKnowledgeBaseItem(item.id);
                            toast.success("Document supprime");
                            fetchKbItems();
                          } catch {
                            toast.error("Erreur suppression");
                          }
                        }}
                        className="text-red-500 bg-transparent border-none cursor-pointer p-0.5 shrink-0 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <ConversationPanel agentId={agentId} />
        </div>

        <ConversationHistory agentId={agentId} />
      </div>

      {showEditModal && (
        <CreateAgentModal
          onClose={() => setShowEditModal(false)}
          onCreated={() => {
            setShowEditModal(false);
            toast.success("Agent mis a jour !");
            fetchAgent();
          }}
          editMode
          agentId={agentId}
          initialData={editData}
        />
      )}
    </div>
  );
}
