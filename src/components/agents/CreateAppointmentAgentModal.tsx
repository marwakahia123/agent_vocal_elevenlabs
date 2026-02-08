"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import AppointmentAgentForm from "./AppointmentAgentForm";
import type { CreateAgentFormData } from "@/types/elevenlabs";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  editMode?: boolean;
  agentId?: string;
  initialData?: Partial<CreateAgentFormData>;
}

export default function CreateAppointmentAgentModal({ onClose, onCreated, editMode, agentId, initialData }: Props) {
  // Escape key handler
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-white rounded-xl w-full max-w-[560px] shadow-2xl my-8"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 m-0">
                {editMode ? "Modifier - Prise de Rendez-vous" : "Configuration - Prise de Rendez-vous"}
              </h2>
              <p className="text-sm text-slate-500 mt-1 m-0">
                {editMode ? "Modifiez la configuration de votre agent de prise de rendez-vous" : "Configurez votre agent de prise de rendez-vous"}
              </p>
            </div>
            <button onClick={onClose} className="btn-ghost p-1 -mt-1 -mr-1">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
            <AppointmentAgentForm
              onCreated={onCreated}
              onCancel={onClose}
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
