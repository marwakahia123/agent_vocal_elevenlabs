"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import CreateAgentForm from "./CreateAgentForm";
import type { CreateAgentFormData } from "@/types/elevenlabs";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  editMode?: boolean;
  agentId?: string;
  initialData?: Partial<CreateAgentFormData>;
}

export default function CreateAgentModal({ onClose, onCreated, editMode, agentId, initialData }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      {/* Modal */}
      <div style={{
        position: "relative",
        backgroundColor: "white",
        borderRadius: "1rem",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        width: "100%",
        maxWidth: "42rem",
        maxHeight: "90vh",
        overflowY: "auto",
        margin: "0 1rem",
      }}>
        <div style={{
          position: "sticky",
          top: 0,
          backgroundColor: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: "1rem 1rem 0 0",
          zIndex: 10,
        }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827", margin: 0 }}>
            {editMode ? "Modifier l'agent" : "Creer un nouvel agent"}
          </h2>
          <button
            onClick={onClose}
            style={{ padding: "0.25rem", background: "none", border: "none", cursor: "pointer", borderRadius: "0.5rem" }}
          >
            <X style={{ height: "1.25rem", width: "1.25rem", color: "#6b7280" }} />
          </button>
        </div>
        <div style={{ padding: "1.5rem" }}>
          <CreateAgentForm
            onCreated={onCreated}
            editMode={editMode}
            agentId={agentId}
            initialData={initialData}
          />
        </div>
      </div>
    </div>
  );
}
