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
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <button
          onClick={() => onDelete(agentId)}
          style={{
            fontSize: "0.75rem",
            backgroundColor: "#dc2626",
            color: "white",
            padding: "0.25rem 0.5rem",
            borderRadius: "0.25rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          Confirmer
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{
            fontSize: "0.75rem",
            backgroundColor: "#e5e7eb",
            color: "#374151",
            padding: "0.25rem 0.5rem",
            borderRadius: "0.25rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="delete-btn"
      title="Supprimer"
      style={{
        opacity: 0,
        transition: "opacity 0.2s",
        padding: "0.25rem",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#9ca3af",
        borderRadius: "0.25rem",
      }}
    >
      <Trash2 style={{ height: "1rem", width: "1rem" }} />
    </button>
  );
}
