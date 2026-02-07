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
      return <CheckCircle size={14} style={{ color: "#15803d" }} />;
    case "inactive":
      return <XCircle size={14} style={{ color: "#dc2626" }} />;
    default:
      return <Clock size={14} style={{ color: "#a16207" }} />;
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
      const { data } = await supabase.from("agents").select("id, name").order("name");
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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "white",
          borderRadius: "0.75rem",
          width: "100%",
          maxWidth: "450px",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#111827", margin: 0 }}>
            {editData ? "Modifier le numero" : "Ajouter un numero"}
          </h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "0.25rem" }}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Numero de telephone *</label>
            <input
              className="input-field"
              type="tel"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              placeholder="+33 1 23 45 67 89"
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Libelle</label>
            <input
              className="input-field"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Ex: Ligne principale, Support..."
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Agent associe</label>
            <select
              className="input-field"
              value={form.agent_id}
              onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
            >
              <option value="">Aucun agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label className="label">Fournisseur</label>
            <select
              className="input-field"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
            >
              <option value="twilio">Twilio</option>
              <option value="vonage">Vonage</option>
              <option value="other">Autre</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : (editData ? "Enregistrer" : "Ajouter")}
            </button>
          </div>
        </form>
      </div>
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
      const { data, error } = await supabase
        .from("phone_numbers")
        .select("*, agent:agents(name)")
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
      const { error } = await supabase
        .from("phone_numbers")
        .update({ status: newStatus })
        .eq("id", num.id);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>
            Numeros de telephone
          </h1>
          <p style={{ color: "#6b7280", marginTop: "0.25rem", fontSize: "0.875rem" }}>
            Gerez vos numeros de telephone et leurs associations
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={fetchNumbers} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <RefreshCw size={16} />
            Actualiser
          </button>
          <button
            onClick={openAddModal}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Plus size={16} />
            Ajouter un numero
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          padding: "1rem",
          backgroundColor: "#FFF7ED",
          border: "1px solid #FFEDD5",
          borderRadius: "0.5rem",
          marginBottom: "1.5rem",
          fontSize: "0.875rem",
          color: "#9a3412",
        }}
      >
        <Info size={20} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
        <div>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>Configuration du transfert d&apos;appels</p>
          <p style={{ margin: "0 0 0.25rem" }}>
            Pour que les appels entrants soient routes vers votre agent vocal, configurez le renvoi d&apos;appels
            depuis votre telephone professionnel en composant :
          </p>
          <p style={{ margin: "0.25rem 0", fontFamily: "monospace", fontWeight: 600, fontSize: "1rem" }}>
            **21*+33411789404#
          </p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#b45309" }}>
            Associez votre numero de telephone a un agent ci-dessous pour activer le routage automatique.
          </p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}>
          <div style={{
            width: "2rem",
            height: "2rem",
            border: "4px solid #FFEDD5",
            borderTopColor: "#F97316",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }} />
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
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {numbers.map((num) => (
            <div key={num.id} className="card" style={{ position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div
                    style={{
                      width: "2.5rem",
                      height: "2.5rem",
                      borderRadius: "0.5rem",
                      backgroundColor: "#FFF7ED",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#F97316",
                    }}
                  >
                    <Phone size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#111827", fontSize: "1rem" }}>
                      {num.phone_number}
                    </div>
                    {num.label && (
                      <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>{num.label}</div>
                    )}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[num.status]}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <StatusIcon status={num.status} />
                  {STATUS_LABELS[num.status]}
                </span>
              </div>

              <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "#6b7280" }}>
                <Bot size={14} />
                <span>Agent : </span>
                <span style={{ fontWeight: 500, color: "#374151" }}>
                  {(num.agent as { name: string } | null)?.name || "Aucun agent lie"}
                </span>
              </div>

              <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#9ca3af" }}>
                Fournisseur : {num.provider}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", borderTop: "1px solid #f3f4f6", paddingTop: "0.75rem" }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  onClick={() => toggleStatus(num)}
                >
                  {num.status === "active" ? <XCircle size={14} /> : <CheckCircle size={14} />}
                  {num.status === "active" ? "Desactiver" : "Activer"}
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  onClick={() => openEditModal(num)}
                >
                  <Edit2 size={14} />
                  Modifier
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.8125rem", color: "#ef4444", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  onClick={() => handleDelete(num.id)}
                >
                  <Trash2 size={14} />
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <NumberModal
          editData={editingNumber}
          onClose={() => { setShowModal(false); setEditingNumber(undefined); }}
          onSaved={() => { setShowModal(false); setEditingNumber(undefined); fetchNumbers(); }}
        />
      )}
    </div>
  );
}
