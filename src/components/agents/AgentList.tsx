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
      <div className="empty-state">
        <Bot className="empty-state-icon" />
        <p className="empty-state-title">Aucun agent</p>
        <p className="empty-state-desc">
          Commencez par creer votre premier agent vocal
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
      {agents.map((agent) => (
        <AgentCard key={agent.agent_id} agent={agent} onDelete={onDelete} onEdit={onEdit} />
      ))}
    </div>
  );
}
