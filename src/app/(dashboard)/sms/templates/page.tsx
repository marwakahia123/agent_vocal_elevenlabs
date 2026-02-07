"use client";

import { useState, useEffect } from "react";
import { Plus, MessageSquare, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { SmsTemplate } from "@/types/database";

export default function SmsTemplatesPage() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [form, setForm] = useState({ name: "", content: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("sms_templates")
      .select("*")
      .order("created_at", { ascending: false });
    setTemplates((data as SmsTemplate[]) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditingTemplate(null);
    setForm({ name: "", content: "" });
    setShowModal(true);
  }

  function openEdit(template: SmsTemplate) {
    setEditingTemplate(template);
    setForm({ name: template.name, content: template.content });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.content.trim()) return;
    setSubmitting(true);
    const supabase = createClient();

    // Extract variables like {{prenom}}, {{nom}}, etc.
    const vars = [...form.content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

    if (editingTemplate) {
      // Update existing
      const { error } = await supabase
        .from("sms_templates")
        .update({ name: form.name, content: form.content, variables: vars })
        .eq("id", editingTemplate.id);
      if (error) {
        toast.error("Erreur lors de la modification");
      } else {
        toast.success("Template modifie !");
        setShowModal(false);
        setEditingTemplate(null);
        setForm({ name: "", content: "" });
        fetchTemplates();
      }
    } else {
      // Create new
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Non connecte"); setSubmitting(false); return; }
      const { error } = await supabase.from("sms_templates").insert({
        user_id: user.id,
        name: form.name,
        content: form.content,
        variables: vars,
      });
      if (error) {
        toast.error("Erreur lors de la creation");
      } else {
        toast.success("Template cree !");
        setShowModal(false);
        setForm({ name: "", content: "" });
        fetchTemplates();
      }
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce template ?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("sms_templates").delete().eq("id", id);
    if (error) {
      toast.error("Erreur de suppression");
    } else {
      toast.success("Template supprime");
      fetchTemplates();
    }
  }

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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>Templates SMS</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>Creez des modeles SMS reutilisables</p>
        </div>
        <button onClick={openCreate} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Plus size={16} /> Nouveau template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="empty-state">
          <MessageSquare className="empty-state-icon" />
          <p className="empty-state-title">Aucun template</p>
          <p className="empty-state-desc">Creez votre premier modele SMS avec des variables comme {"{{prenom}}"}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
          {templates.map((t) => (
            <div key={t.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <h3 style={{ fontWeight: 600, color: "#111827", margin: 0 }}>{t.name}</h3>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <button className="btn-ghost" style={{ padding: "0.25rem" }} onClick={() => openEdit(t)}><Edit2 size={14} /></button>
                  <button className="btn-ghost" style={{ padding: "0.25rem", color: "#DC2626" }} onClick={() => handleDelete(t.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <p style={{ fontSize: "0.8125rem", color: "#4b5563", backgroundColor: "#f9fafb", borderRadius: "0.375rem", padding: "0.75rem", margin: "0 0 0.75rem" }}>
                {t.content}
              </p>
              {t.variables.length > 0 && (
                <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                  {t.variables.map((v) => (
                    <span key={v} className="badge badge-info">{`{{${v}}}`}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => { setShowModal(false); setEditingTemplate(null); }} />
          <div style={{ position: "relative", backgroundColor: "white", borderRadius: "1rem", padding: "1.5rem", width: "100%", maxWidth: "28rem", margin: "0 1rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
              {editingTemplate ? "Modifier le template" : "Nouveau template SMS"}
            </h2>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="label">Nom *</label>
                <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">Contenu *</label>
                <textarea className="input-field" style={{ minHeight: "100px" }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required placeholder="Bonjour {{prenom}}, votre rendez-vous est confirme pour..." />
                <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>Utilisez {"{{variable}}"} pour les champs dynamiques</p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => { setShowModal(false); setEditingTemplate(null); }} className="btn-secondary">Annuler</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? (editingTemplate ? "Modification..." : "Creation...") : (editingTemplate ? "Modifier" : "Creer")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
