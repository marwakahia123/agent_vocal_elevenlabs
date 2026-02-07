"use client";

import AgentCard from "./AgentCard";
import type { Agent } from "@/types/elevenlabs";
import { Bot } from "lucide-react";

interface Props {
  agents: Agent[];
  onDelete: (agentId: string) => void;
  onEdit?: (agent: Agent) => void;
}

export default function AgentList({ agents, onDelete, onEdit }: Props) {
  if (agents.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "5rem 1.5rem" }}>
        <Bot style={{ height: "4rem", width: "4rem", color: "#d1d5db", margin: "0 auto 1rem" }} />
        <h3 style={{ fontSize: "1.125rem", fontWeight: 500, color: "#111827", margin: 0 }}>Aucun agent</h3>
        <p style={{ color: "#6b7280", marginTop: "0.25rem" }}>
          Commencez par creer votre premier agent vocal
        </p>
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      gap: "1.5rem",
    }}>
      {agents.map((agent) => (
        <AgentCard key={agent.agent_id} agent={agent} onDelete={onDelete} onEdit={onEdit} />
      ))}
    </div>
  );
}
