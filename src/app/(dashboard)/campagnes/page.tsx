"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Megaphone, Play, Pause, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { pauseCampaign } from "@/lib/elevenlabs";
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
    const { data } = await supabase
      .from("campaign_groups")
      .select("*")
      .order("created_at", { ascending: false });
    setCampaigns((data as CampaignGroup[]) || []);
    setLoading(false);
  }

  async function fetchAgents() {
    const supabase = createClient();
    const { data } = await supabase.from("agents").select("id, name").order("name");
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
      <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}>
        <div style={{ width: "2rem", height: "2rem", border: "4px solid #FFEDD5", borderTopColor: "#F97316", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>Campagnes</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>Gerez vos campagnes d&apos;appels sortants</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
          {campaigns.map((c) => {
            const s = statusColors[c.status] || statusColors.draft;
            const progress = c.total_contacts > 0 ? Math.round((c.contacts_called / c.total_contacts) * 100) : 0;
            return (
              <div key={c.id} className="card" onClick={() => router.push(`/campagnes/${c.id}`)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                  <div>
                    <h3 style={{ fontWeight: 600, color: "#111827", margin: 0 }}>{c.name}</h3>
                    {c.description && <p style={{ fontSize: "0.8125rem", color: "#6b7280", margin: "0.25rem 0 0" }}>{c.description}</p>}
                  </div>
                  <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontSize: "0.8125rem", marginBottom: "1rem" }}>
                  <div><span style={{ color: "#6b7280" }}>Contacts</span><br /><strong>{c.total_contacts}</strong></div>
                  <div><span style={{ color: "#6b7280" }}>Appeles</span><br /><strong>{c.contacts_called}</strong></div>
                  <div><span style={{ color: "#6b7280" }}>Repondus</span><br /><strong>{c.contacts_answered}</strong></div>
                </div>
                <div style={{ height: "6px", backgroundColor: "#f3f4f6", borderRadius: "3px", overflow: "hidden", marginBottom: "0.75rem" }}>
                  <div style={{ height: "100%", width: `${progress}%`, backgroundColor: "#F97316", borderRadius: "3px" }} />
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {(c.status === "draft" || c.status === "paused") && (
                    <button
                      className="btn-primary"
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", padding: "0.375rem" }}
                      onClick={(e) => { e.stopPropagation(); router.push(`/campagnes/${c.id}`); }}
                    >
                      {c.total_contacts > 0 ? <><Play size={14} /> Lancer</> : <><Eye size={14} /> Configurer</>}
                    </button>
                  )}
                  {c.status === "running" && (
                    <button
                      className="btn-secondary"
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", padding: "0.375rem" }}
                      onClick={(e) => { e.stopPropagation(); handlePause(c.id); }}
                    >
                      <Pause size={14} /> Pause
                    </button>
                  )}
                  <button
                    className="btn-ghost"
                    style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.375rem" }}
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

      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowModal(false)} />
          <div style={{ position: "relative", backgroundColor: "white", borderRadius: "1rem", padding: "1.5rem", width: "100%", maxWidth: "28rem", margin: "0 1rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>Nouvelle campagne</h2>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="label">Nom *</label>
                <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input-field" style={{ minHeight: "80px" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
                <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creation..." : "Creer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
