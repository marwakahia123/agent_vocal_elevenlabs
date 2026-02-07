"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Megaphone, Play, Pause, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { pauseCampaign } from "@/lib/elevenlabs";
import { AnimatePresence, motion } from "framer-motion";
import type { CampaignGroup } from "@/types/database";

export default function CampagnesPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", agent_id: "" });
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCampaigns();
    fetchAgents();
  }, []);

  async function fetchCampaigns() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("campaign_groups")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCampaigns((data as CampaignGroup[]) || []);
    setLoading(false);
  }

  async function fetchAgents() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("agents").select("id, name").eq("user_id", user.id).order("name");
    if (data) setAgents(data);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Non connecte"); setSubmitting(false); return; }
    const { error } = await supabase.from("campaign_groups").insert({
      user_id: user.id,
      name: form.name,
      description: form.description,
      agent_id: form.agent_id || null,
    });
    if (error) {
      toast.error("Erreur lors de la creation");
    } else {
      toast.success("Campagne creee !");
      setShowModal(false);
      setForm({ name: "", description: "", agent_id: "" });
      fetchCampaigns();
    }
    setSubmitting(false);
  }

  async function handlePause(id: string) {
    try {
      await pauseCampaign(id);
      toast.success("Campagne en pause");
      fetchCampaigns();
    } catch {
      toast.error("Erreur lors de la mise en pause");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette campagne ?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("campaign_groups").delete().eq("id", id);
    if (error) {
      toast.error("Erreur lors de la suppression");
    } else {
      toast.success("Campagne supprimee");
      fetchCampaigns();
    }
  }

  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: "#f3f4f6", color: "#6b7280", label: "Brouillon" },
    scheduled: { bg: "#EFF6FF", color: "#2563EB", label: "Planifiee" },
    running: { bg: "#ECFDF5", color: "#059669", label: "En cours" },
    paused: { bg: "#FEF3C7", color: "#D97706", label: "En pause" },
    completed: { bg: "#dcfce7", color: "#15803d", label: "Terminee" },
    cancelled: { bg: "#FEE2E2", color: "#DC2626", label: "Annulee" },
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Campagnes</h1>
          <p className="text-sm text-slate-500 mt-1">Gerez vos campagnes d&apos;appels sortants</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle campagne
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="empty-state">
          <Megaphone className="empty-state-icon" />
          <p className="empty-state-title">Aucune campagne</p>
          <p className="empty-state-desc">Creez votre premiere campagne d&apos;appels</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {campaigns.map((c) => {
            const s = statusColors[c.status] || statusColors.draft;
            const progress = c.total_contacts > 0 ? Math.round((c.contacts_called / c.total_contacts) * 100) : 0;
            return (
              <div key={c.id} className="card cursor-pointer" onClick={() => router.push(`/campagnes/${c.id}`)}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900 m-0">{c.name}</h3>
                    {c.description && <p className="text-[0.8125rem] text-slate-500 mt-1 m-0">{c.description}</p>}
                  </div>
                  <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[0.8125rem] mb-4">
                  <div><span className="text-slate-500">Contacts</span><br /><strong>{c.total_contacts}</strong></div>
                  <div><span className="text-slate-500">Appeles</span><br /><strong>{c.contacts_called}</strong></div>
                  <div><span className="text-slate-500">Repondus</span><br /><strong>{c.contacts_answered}</strong></div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                  <div className="h-full rounded-full bg-slate-900" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex gap-2">
                  {(c.status === "draft" || c.status === "paused") && (
                    <button
                      className="btn-primary flex-1 flex items-center justify-center gap-1 py-1.5"
                      onClick={(e) => { e.stopPropagation(); router.push(`/campagnes/${c.id}`); }}
                    >
                      {c.total_contacts > 0 ? <><Play size={14} /> Lancer</> : <><Eye size={14} /> Configurer</>}
                    </button>
                  )}
                  {c.status === "running" && (
                    <button
                      className="btn-secondary flex-1 flex items-center justify-center gap-1 py-1.5"
                      onClick={(e) => { e.stopPropagation(); handlePause(c.id); }}
                    >
                      <Pause size={14} /> Pause
                    </button>
                  )}
                  <button
                    className="btn-ghost flex items-center gap-1 py-1.5"
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl"
            >
              <h2 className="text-lg font-bold mb-4">Nouvelle campagne</h2>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <label className="label">Nom *</label>
                  <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea className="input-field min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div>
                  <label className="label">Agent associe</label>
                  <select className="input-field" value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
                    <option value="">Aucun agent</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
                  <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creation..." : "Creer"}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
