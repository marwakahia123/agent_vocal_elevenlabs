"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Monitor,
  Plus,
  RefreshCw,
  X,
  Trash2,
  Copy,
  CheckCircle,
  XCircle,
  Code,
  Bot,
  Globe,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Widget } from "@/types/database";

interface WidgetWithAgent extends Widget {
  agent?: { name: string } | null;
}

// ===================== CREATE WIDGET MODAL =====================
function CreateWidgetModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    agent_id: "",
    position: "bottom-right" as "bottom-right" | "bottom-left",
    primaryColor: "#F97316",
    greeting: "Bonjour ! Comment puis-je vous aider ?",
    domain_whitelist: "",
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
    if (!form.name.trim()) {
      toast.error("Le nom du widget est requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Vous devez etre connecte");
        return;
      }
      const embedToken = crypto.randomUUID().replace(/-/g, "").substring(0, 24);
      const { error } = await supabase.from("widgets").insert({
        user_id: user.id,
        name: form.name.trim(),
        agent_id: form.agent_id || null,
        embed_token: embedToken,
        config: {
          position: form.position,
          primaryColor: form.primaryColor,
          greeting: form.greeting,
          width: 380,
          height: 600,
        },
        domain_whitelist: form.domain_whitelist
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean),
        is_active: true,
      });
      if (error) throw error;
      toast.success("Widget cree avec succes");
      onCreated();
    } catch {
      toast.error("Erreur lors de la creation du widget");
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
          maxWidth: "500px",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#111827", margin: 0 }}>
            Creer un widget
          </h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "0.25rem" }}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Nom du widget *</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Widget site web"
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Position</label>
              <select
                className="input-field"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value as "bottom-right" | "bottom-left" })}
              >
                <option value="bottom-right">Bas droite</option>
                <option value="bottom-left">Bas gauche</option>
              </select>
            </div>
            <div>
              <label className="label">Couleur principale</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  style={{ width: "2.5rem", height: "2.25rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", cursor: "pointer" }}
                />
                <input
                  className="input-field"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Message d&apos;accueil</label>
            <textarea
              className="input-field"
              rows={2}
              value={form.greeting}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              style={{ resize: "vertical" }}
            />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label className="label">Domaines autorises (separes par des virgules)</label>
            <input
              className="input-field"
              value={form.domain_whitelist}
              onChange={(e) => setForm({ ...form, domain_whitelist: e.target.value })}
              placeholder="example.com, mon-site.fr"
            />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Creation..." : "Creer le widget"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== MAIN PAGE =====================
export default function WidgetsPage() {
  const [widgets, setWidgets] = useState<WidgetWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchWidgets = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("widgets")
        .select("*, agent:agents(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setWidgets((data as WidgetWithAgent[]) || []);
    } catch {
      toast.error("Erreur lors du chargement des widgets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWidgets();
  }, [fetchWidgets]);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce widget ?")) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("widgets").delete().eq("id", id);
      if (error) throw error;
      toast.success("Widget supprime");
      fetchWidgets();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const toggleWidget = async (widget: WidgetWithAgent) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("widgets")
        .update({ is_active: !widget.is_active })
        .eq("id", widget.id);
      if (error) throw error;
      toast.success(widget.is_active ? "Widget desactive" : "Widget active");
      fetchWidgets();
    } catch {
      toast.error("Erreur lors de la mise a jour");
    }
  };

  const copyEmbed = (token: string) => {
    const code = `<script src="https://hallcall.fr/widget.js" data-token="${token}"></script>`;
    navigator.clipboard.writeText(code);
    toast.success("Code d'integration copie !");
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>
            Widgets
          </h1>
          <p style={{ color: "#6b7280", marginTop: "0.25rem", fontSize: "0.875rem" }}>
            Integrez un agent vocal sur votre site web
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={fetchWidgets} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <RefreshCw size={16} />
            Actualiser
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Plus size={16} />
            Nouveau widget
          </button>
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
      ) : widgets.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Monitor size={48} className="empty-state-icon" />
            <p className="empty-state-title">Aucun widget</p>
            <p className="empty-state-desc">Creez votre premier widget pour l&apos;integrer sur votre site</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
          {widgets.map((widget) => (
            <div key={widget.id} className="card">
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
                    <Monitor size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#111827", fontSize: "1rem" }}>{widget.name}</div>
                    <div style={{ fontSize: "0.8125rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Bot size={12} />
                      {(widget.agent as { name: string } | null)?.name || "Aucun agent"}
                    </div>
                  </div>
                </div>
                <span className={`badge ${widget.is_active ? "badge-success" : "badge-danger"}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  {widget.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {widget.is_active ? "Actif" : "Inactif"}
                </span>
              </div>

              {/* Embed token */}
              <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>Token d&apos;integration</div>
                <div style={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "#374151", wordBreak: "break-all" }}>
                  {widget.embed_token}
                </div>
              </div>

              {/* Domains */}
              {widget.domain_whitelist?.length > 0 && (
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.25rem", flexWrap: "wrap", alignItems: "center" }}>
                  <Globe size={12} style={{ color: "#9ca3af" }} />
                  {widget.domain_whitelist.map((domain) => (
                    <span key={domain} className="badge badge-neutral" style={{ fontSize: "0.6875rem" }}>
                      {domain}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", borderTop: "1px solid #f3f4f6", paddingTop: "0.75rem", flexWrap: "wrap" }}>
                <Link
                  href={`/widgets/${widget.id}`}
                  className="btn-primary"
                  style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.25rem", textDecoration: "none", flex: 1, justifyContent: "center" }}
                >
                  <Settings2 size={14} />
                  Configurer
                </Link>
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  onClick={() => copyEmbed(widget.embed_token)}
                >
                  <Code size={14} />
                  Code
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  onClick={() => toggleWidget(widget)}
                >
                  {widget.is_active ? <XCircle size={14} /> : <CheckCircle size={14} />}
                  {widget.is_active ? "Desactiver" : "Activer"}
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.8125rem", color: "#ef4444", display: "flex", alignItems: "center", gap: "0.25rem" }}
                  onClick={() => handleDelete(widget.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showCreateModal && (
        <CreateWidgetModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchWidgets();
          }}
        />
      )}
    </div>
  );
}
