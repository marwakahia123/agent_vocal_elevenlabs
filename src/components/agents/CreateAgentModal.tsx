"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
        >
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
            <h2 className="text-xl font-bold text-slate-900 m-0">
              {editMode ? "Modifier l'agent" : "Creer un nouvel agent"}
            </h2>
            <button
              onClick={onClose}
              className="p-1 bg-transparent border-none cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>
          <div className="p-6">
            <CreateAgentForm
              onCreated={onCreated}
              editMode={editMode}
              agentId={agentId}
              initialData={initialData}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
