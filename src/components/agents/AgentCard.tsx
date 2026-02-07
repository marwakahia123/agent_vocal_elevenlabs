"use client";

import Link from "next/link";
import { Bot, MessageSquare, Globe, Edit2 } from "lucide-react";
import type { Agent } from "@/types/elevenlabs";
import DeleteAgentButton from "./DeleteAgentButton";

interface Props {
  agent: Agent;
  onDelete: (agentId: string) => void;
  onEdit?: (agent: Agent) => void;
}

export default function AgentCard({ agent, onDelete, onEdit }: Props) {
  const language = agent.conversation_config?.agent?.language || "?";
  const firstMessage = agent.conversation_config?.agent?.first_message || "";

  return (
    <div
      className="card"
      style={{ transition: "box-shadow 0.2s", cursor: "default" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
        const deleteBtn = e.currentTarget.querySelector(".delete-btn") as HTMLElement;
        if (deleteBtn) deleteBtn.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 2px 0 rgba(0, 0, 0, 0.05)";
        const deleteBtn = e.currentTarget.querySelector(".delete-btn") as HTMLElement;
        if (deleteBtn) deleteBtn.style.opacity = "0";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ backgroundColor: "#FFF7ED", padding: "0.5rem", borderRadius: "0.5rem" }}>
            <Bot style={{ height: "1.5rem", width: "1.5rem", color: "#F97316" }} />
          </div>
          <div>
            <h3 style={{ fontWeight: 600, color: "#111827", margin: 0 }}>{agent.name}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", color: "#6b7280", marginTop: "0.125rem" }}>
              <Globe style={{ height: "0.75rem", width: "0.75rem" }} />
              <span>{language.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <DeleteAgentButton agentId={agent.agent_id} onDelete={onDelete} />
      </div>

      {firstMessage && (
        <div style={{ marginTop: "1rem", display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.875rem", color: "#4b5563" }}>
          <MessageSquare style={{ height: "1rem", width: "1rem", marginTop: "0.125rem", flexShrink: 0, color: "#9ca3af" }} />
          <p style={{
            margin: 0,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}>{firstMessage}</p>
        </div>
      )}

      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f3f4f6", display: "flex", gap: "0.5rem" }}>
        {onEdit && (
          <button
            onClick={() => onEdit(agent)}
            className="btn-secondary"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", fontSize: "0.875rem", flex: 1 }}
          >
            <Edit2 size={14} />
            Modifier
          </button>
        )}
        <Link
          href={`/agents/${agent.agent_id}`}
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.875rem", textDecoration: "none", flex: 1 }}
        >
          Tester
        </Link>
      </div>
    </div>
  );
}
