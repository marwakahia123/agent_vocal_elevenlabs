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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <Link
          href="/agents"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.875rem",
            color: "#6b7280",
            textDecoration: "none",
          }}
        >
          <ArrowLeft style={{ height: "1rem", width: "1rem" }} />
          Retour aux agents
        </Link>
        <button
          onClick={() => setShowEditModal(true)}
          className="btn-secondary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Edit2 size={16} />
          Modifier
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "2rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                <div style={{ backgroundColor: "#FFF7ED", padding: "0.75rem", borderRadius: "0.5rem" }}>
                  <Bot style={{ height: "2rem", width: "2rem", color: "#F97316" }} />
                </div>
                <div>
                  <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827", margin: 0 }}>{agent.name}</h1>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    <Globe style={{ height: "0.875rem", width: "0.875rem" }} />
                    <span>{config?.agent?.language?.toUpperCase() || "?"}</span>
                  </div>
                </div>
              </div>

              {config?.agent?.first_message && (
                <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "1rem" }}>
                  <h3 style={{ fontSize: "0.75rem", fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                    Premier message
                  </h3>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.875rem", color: "#374151" }}>
                    <MessageSquare style={{ height: "1rem", width: "1rem", marginTop: "0.125rem", flexShrink: 0, color: "#9ca3af" }} />
                    <p style={{ margin: 0 }}>{config.agent.first_message}</p>
                  </div>
                </div>
              )}

              {config?.agent?.prompt?.prompt && (
                <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "1rem", marginTop: "1rem" }}>
                  <h3 style={{ fontSize: "0.75rem", fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                    Prompt systeme
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "#4b5563", whiteSpace: "pre-wrap", margin: 0 }}>
                    {config.agent.prompt.prompt}
                  </p>
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ fontSize: "0.75rem", fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                Configuration technique
              </h3>
              <dl style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", margin: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt style={{ color: "#6b7280" }}>Agent ID</dt>
                  <dd style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#374151", margin: 0 }}>
                    {agent.agent_id.slice(0, 16)}...
                  </dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt style={{ color: "#6b7280" }}>Modele LLM</dt>
                  <dd style={{ margin: 0 }}>{config?.agent?.prompt?.llm || "?"}</dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt style={{ color: "#6b7280" }}>Voix ID</dt>
                  <dd style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#374151", margin: 0 }}>
                    {config?.tts?.voice_id ? config.tts.voice_id.slice(0, 16) + "..." : "?"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Knowledge Base */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <h3 style={{ fontSize: "0.75rem", fontWeight: 500, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                  Base de connaissances
                </h3>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.75rem",
                    color: "#F97316",
                    cursor: kbUploading ? "wait" : "pointer",
                    fontWeight: 500,
                  }}
                >
                  {kbUploading ? (
                    <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Upload size={12} />
                  )}
                  Ajouter
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    multiple
                    style={{ display: "none" }}
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
                <p style={{ fontSize: "0.8125rem", color: "#9ca3af", margin: 0 }}>
                  Aucun document ajoute
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {kbItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.375rem 0.5rem",
                        backgroundColor: "#f9fafb",
                        borderRadius: "0.375rem",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", overflow: "hidden" }}>
                        {item.file_type === "url" ? (
                          <Link2 size={14} style={{ color: "#F97316", flexShrink: 0 }} />
                        ) : (
                          <FileText size={14} style={{ color: "#F97316", flexShrink: 0 }} />
                        )}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.file_name}
                        </span>
                        <span
                          style={{
                            fontSize: "0.625rem",
                            padding: "0.125rem 0.375rem",
                            borderRadius: "9999px",
                            backgroundColor: item.status === "ready" ? "#dcfce7" : item.status === "failed" ? "#fef2f2" : "#fef3c7",
                            color: item.status === "ready" ? "#15803d" : item.status === "failed" ? "#dc2626" : "#a16207",
                            flexShrink: 0,
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
                        style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "0.125rem", flexShrink: 0 }}
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
