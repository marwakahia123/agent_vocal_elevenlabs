"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  agentId: string;
  onDelete: (agentId: string) => void;
}

export default function DeleteAgentButton({ agentId, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => onDelete(agentId)}
          className="text-xs bg-red-600 text-white px-2 py-1 rounded border-none cursor-pointer hover:bg-red-700"
        >
          Confirmer
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded border-none cursor-pointer hover:bg-slate-300"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="delete-btn opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-transparent border-none cursor-pointer text-slate-400 rounded hover:text-red-500"
      title="Supprimer"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
