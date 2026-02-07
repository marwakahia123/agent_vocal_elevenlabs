"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  Plus,
  RefreshCw,
  X,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  Clock,
  Bot,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import type { PhoneNumber } from "@/types/database";

interface PhoneNumberWithAgent extends PhoneNumber {
  agent?: { name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  pending: "En attente",
};

const STATUS_BADGE: Record<string, string> = {
  active: "badge-success",
  inactive: "badge-danger",
  pending: "badge-warning",
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <CheckCircle size={14} className="text-emerald-700" />;
    case "inactive":
      return <XCircle size={14} className="text-red-600" />;
    default:
      return <Clock size={14} className="text-amber-600" />;
  }
}

// ===================== NUMBER MODAL (ADD/EDIT) =====================
function NumberModal({
  onClose,
  onSaved,
  editData,
}: {
  onClose: () => void;
  onSaved: () => void;
  editData?: PhoneNumberWithAgent;
}) {
  const [form, setForm] = useState({
    phone_number: editData?.phone_number || "",
    label: editData?.label || "",
    provider: editData?.provider || "twilio",
    agent_id: editData?.agent_id || "",
  });
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchAgents() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("agents").select("id, name").eq("user_id", user.id).order("name");
      if (data) setAgents(data);
    }
    fetchAgents();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone_number.trim()) {
      toast.error("Le numero de telephone est requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        phone_number: form.phone_number.trim(),
        label: form.label.trim() || null,
        provider: form.provider,
        agent_id: form.agent_id || null,
      };

      if (editData) {
        const { error } = await supabase.from("phone_numbers").update(payload).eq("id", editData.id);
        if (error) throw error;
        toast.success("Numero mis a jour");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { toast.error("Non connecte"); return; }
        const { error } = await supabase.from("phone_numbers").insert({ ...payload, user_id: user.id, status: "active" });
        if (error) throw error;
        toast.success("Numero ajoute avec succes");
      }
      onSaved();
    } catch {
      toast.error(editData ? "Erreur lors de la mise a jour" : "Erreur lors de l'ajout");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-xl w-full max-w-[450px] p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-slate-900 m-0">
            {editData ? "Modifier le numero" : "Ajouter un numero"}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="label">Numero de telephone *</label>
            <input className="input-field" type="tel" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder="+33 1 23 45 67 89" />
          </div>
          <div className="mb-4">
            <label className="label">Libelle</label>
            <input className="input-field" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex: Ligne principale, Support..." />
          </div>
          <div className="mb-4">
            <label className="label">Agent associe</label>
            <select className="input-field" value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
              <option value="">Aucun agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="mb-6">
            <label className="label">Fournisseur</label>
            <select className="input-field" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
              <option value="twilio">Twilio</option>
              <option value="vonage">Vonage</option>
              <option value="other">Autre</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : (editData ? "Enregistrer" : "Ajouter")}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ===================== MAIN PAGE =====================
export default function NumerosPage() {
  const [numbers, setNumbers] = useState<PhoneNumberWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingNumber, setEditingNumber] = useState<PhoneNumberWithAgent | undefined>(undefined);

  const fetchNumbers = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("phone_numbers")
        .select("*, agent:agents(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setNumbers((data as PhoneNumberWithAgent[]) || []);
    } catch {
      toast.error("Erreur lors du chargement des numeros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNumbers();
  }, [fetchNumbers]);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce numero ?")) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("phone_numbers").delete().eq("id", id);
      if (error) throw error;
      toast.success("Numero supprime");
      fetchNumbers();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const toggleStatus = async (num: PhoneNumberWithAgent) => {
    const newStatus = num.status === "active" ? "inactive" : "active";
    try {
      const supabase = createClient();
      const { error } = await supabase.from("phone_numbers").update({ status: newStatus }).eq("id", num.id);
      if (error) throw error;
      toast.success(`Numero ${newStatus === "active" ? "active" : "desactive"}`);
      fetchNumbers();
    } catch {
      toast.error("Erreur lors de la mise a jour");
    }
  };

  const openEditModal = (num: PhoneNumberWithAgent) => {
    setEditingNumber(num);
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingNumber(undefined);
    setShowModal(true);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Numeros de telephone</h1>
          <p className="text-sm text-slate-500 mt-1">Gerez vos numeros de telephone et leurs associations</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchNumbers} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Actualiser
          </button>
          <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Ajouter un numero
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6 text-sm text-blue-900">
        <Info size={20} className="shrink-0 mt-0.5" />
        <div>
          <p className="m-0 mb-2 font-semibold">Configuration du transfert d&apos;appels</p>
          <p className="m-0 mb-1">
            Pour que les appels entrants soient routes vers votre agent vocal, configurez le renvoi d&apos;appels
            depuis votre telephone professionnel en composant :
          </p>
          <p className="my-1 font-mono font-semibold text-base">
            **21*+33411789404#
          </p>
          <p className="mt-1 mb-0 text-[0.8125rem] text-blue-700">
            Associez votre numero de telephone a un agent ci-dessous pour activer le routage automatique.
          </p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
        </div>
      ) : numbers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Phone size={48} className="empty-state-icon" />
            <p className="empty-state-title">Aucun numero</p>
            <p className="empty-state-desc">Ajoutez votre premier numero de telephone</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
          {numbers.map((num) => (
            <div key={num.id} className="card relative">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-900">
                    <Phone size={20} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{num.phone_number}</div>
                    {num.label && <div className="text-[0.8125rem] text-slate-500">{num.label}</div>}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[num.status]} inline-flex items-center gap-1`}>
                  <StatusIcon status={num.status} />
                  {STATUS_LABELS[num.status]}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2 text-[0.8125rem] text-slate-500">
                <Bot size={14} />
                <span>Agent : </span>
                <span className="font-medium text-slate-700">
                  {(num.agent as { name: string } | null)?.name || "Aucun agent lie"}
                </span>
              </div>

              <div className="mt-2 text-xs text-slate-400">
                Fournisseur : {num.provider}
              </div>

              <div className="flex gap-2 mt-4 border-t border-slate-100 pt-3">
                <button className="btn-ghost text-[0.8125rem] flex items-center gap-1" onClick={() => toggleStatus(num)}>
                  {num.status === "active" ? <XCircle size={14} /> : <CheckCircle size={14} />}
                  {num.status === "active" ? "Desactiver" : "Activer"}
                </button>
                <button className="btn-ghost text-[0.8125rem] flex items-center gap-1" onClick={() => openEditModal(num)}>
                  <Edit2 size={14} /> Modifier
                </button>
                <button className="btn-ghost text-[0.8125rem] text-red-500 flex items-center gap-1" onClick={() => handleDelete(num.id)}>
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <NumberModal
            editData={editingNumber}
            onClose={() => { setShowModal(false); setEditingNumber(undefined); }}
            onSaved={() => { setShowModal(false); setEditingNumber(undefined); fetchNumbers(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
