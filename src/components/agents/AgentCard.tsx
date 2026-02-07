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
    <div className="card transition-shadow hover:shadow-md group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-lg">
            <Bot className="h-6 w-6 text-slate-900" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 m-0">{agent.name}</h3>
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
              <Globe className="h-3 w-3" />
              <span>{language.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <DeleteAgentButton agentId={agent.agent_id} onDelete={onDelete} />
      </div>

      {firstMessage && (
        <div className="mt-4 flex items-start gap-2 text-sm text-slate-600">
          <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
          <p className="m-0 overflow-hidden line-clamp-2">{firstMessage}</p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
        {onEdit && (
          <button
            onClick={() => onEdit(agent)}
            className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-sm"
          >
            <Edit2 size={14} />
            Modifier
          </button>
        )}
        <Link
          href={`/agents/${agent.agent_id}`}
          className="btn-primary flex-1 flex items-center justify-center text-sm no-underline"
        >
          Tester
        </Link>
      </div>
    </div>
  );
}
