"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Monitor,
  Plus,
  RefreshCw,
  X,
  Trash2,
  AlertTriangle,
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
import { AnimatePresence, motion } from "framer-motion";
import type { Widget } from "@/types/database";

interface WidgetWithAgent extends Widget {
  agent?: { name: string; elevenlabs_agent_id: string } | null;
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
    primaryColor: "#0f172a",
    greeting: "Bonjour ! Comment puis-je vous aider ?",
    domain_whitelist: "",
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
        className="relative bg-white rounded-xl w-full max-w-[500px] max-h-[90vh] overflow-auto p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-slate-900 m-0">Creer un widget</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="label">Nom du widget *</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Widget site web" />
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
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Position</label>
              <select className="input-field" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value as "bottom-right" | "bottom-left" })}>
                <option value="bottom-right">Bas droite</option>
                <option value="bottom-left">Bas gauche</option>
              </select>
            </div>
            <div>
              <label className="label">Couleur principale</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  className="w-10 h-9 border border-slate-200 rounded-md cursor-pointer"
                />
                <input className="input-field flex-1" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Message d&apos;accueil</label>
            <textarea className="input-field resize-y" rows={2} value={form.greeting} onChange={(e) => setForm({ ...form, greeting: e.target.value })} />
          </div>
          <div className="mb-6">
            <label className="label">Domaines autorises (separes par des virgules)</label>
            <input className="input-field" value={form.domain_whitelist} onChange={(e) => setForm({ ...form, domain_whitelist: e.target.value })} placeholder="example.com, mon-site.fr" />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Creation..." : "Creer le widget"}
            </button>
          </div>
        </form>
      </motion.div>
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("widgets")
        .select("*, agent:agents(name, elevenlabs_agent_id)")
        .eq("user_id", user.id)
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

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("widgets").delete().eq("id", deleteTarget);
      if (error) throw error;
      toast.success("Widget supprime");
      fetchWidgets();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
    setDeleteTarget(null);
  };

  const toggleWidget = async (widget: WidgetWithAgent) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("widgets").update({ is_active: !widget.is_active }).eq("id", widget.id);
      if (error) throw error;
      toast.success(widget.is_active ? "Widget desactive" : "Widget active");
      fetchWidgets();
    } catch {
      toast.error("Erreur lors de la mise a jour");
    }
  };

  const copyEmbed = (widget: WidgetWithAgent) => {
    const elAgentId = widget.agent?.elevenlabs_agent_id;
    if (!elAgentId) {
      toast.error("Associez un agent a ce widget d'abord");
      return;
    }
    const appUrl = typeof window !== "undefined" ? window.location.origin : "https://hallcall.fr";
    const code = `<hallcall agent-id="${elAgentId}"></hallcall>\n<script src="${appUrl}/api/widgets/script/${elAgentId}"></script>`;
    navigator.clipboard.writeText(code);
    toast.success("Code d'integration copie !");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Widgets</h1>
          <p className="text-sm text-slate-500 mt-1">Integrez un agent vocal sur votre site web</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchWidgets} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Actualiser
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nouveau widget
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
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
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(380px,1fr))]">
          {widgets.map((widget) => (
            <div key={widget.id} className="card">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-900">
                    <Monitor size={20} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{widget.name}</div>
                    <div className="text-[0.8125rem] text-slate-500 flex items-center gap-1">
                      <Bot size={12} />
                      {(widget.agent as { name: string } | null)?.name || "Aucun agent"}
                    </div>
                  </div>
                </div>
                <span className={`badge ${widget.is_active ? "badge-success" : "badge-danger"} inline-flex items-center gap-1`}>
                  {widget.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {widget.is_active ? "Actif" : "Inactif"}
                </span>
              </div>

              {/* Embed token */}
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500 mb-1">Token d&apos;integration</div>
                <div className="font-mono text-[0.8125rem] text-slate-700 break-all">
                  {widget.embed_token}
                </div>
              </div>

              {/* Domains */}
              {widget.domain_whitelist?.length > 0 && (
                <div className="mt-3 flex gap-1 flex-wrap items-center">
                  <Globe size={12} className="text-slate-400" />
                  {widget.domain_whitelist.map((domain) => (
                    <span key={domain} className="badge badge-neutral text-[0.6875rem]">{domain}</span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-4 border-t border-slate-100 pt-3 flex-wrap">
                <Link
                  href={`/widgets/${widget.id}`}
                  className="btn-primary text-[0.8125rem] flex items-center gap-1 no-underline flex-1 justify-center"
                >
                  <Settings2 size={14} /> Configurer
                </Link>
                <button className="btn-ghost text-[0.8125rem] flex items-center gap-1" onClick={() => copyEmbed(widget)}>
                  <Code size={14} /> Code
                </button>
                <button className="btn-ghost text-[0.8125rem] flex items-center gap-1" onClick={() => toggleWidget(widget)}>
                  {widget.is_active ? <XCircle size={14} /> : <CheckCircle size={14} />}
                  {widget.is_active ? "Desactiver" : "Activer"}
                </button>
                <button className="btn-ghost text-[0.8125rem] text-red-500 flex items-center gap-1" onClick={() => setDeleteTarget(widget.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDeleteTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-red-600" />
                </div>
                <h2 className="text-lg font-bold m-0 text-slate-900">Supprimer le widget</h2>
              </div>
              <p className="text-sm text-slate-600 mb-6">
                Cette action est irreversible. Le widget sera definitivement supprime.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Annuler</button>
                <button onClick={confirmDelete} className="btn-primary flex items-center gap-1" style={{ backgroundColor: "#DC2626" }}>
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateWidgetModal
            onClose={() => setShowCreateModal(false)}
            onCreated={() => { setShowCreateModal(false); fetchWidgets(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
