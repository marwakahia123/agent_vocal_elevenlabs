"use client";

import { useState, useEffect } from "react";
import { Plus, MessageSquare, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("sms_templates")
      .select("*")
      .eq("user_id", user.id)
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

    const vars = [...form.content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

    if (editingTemplate) {
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
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Templates SMS</h1>
          <p className="text-sm text-slate-500 mt-1">Creez des modeles SMS reutilisables</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {templates.map((t) => (
            <div key={t.id} className="card">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold text-slate-900 m-0">{t.name}</h3>
                <div className="flex gap-1">
                  <button className="btn-ghost p-1" onClick={() => openEdit(t)}><Edit2 size={14} /></button>
                  <button className="btn-ghost p-1 text-red-600" onClick={() => handleDelete(t.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <p className="text-[0.8125rem] text-slate-600 bg-slate-50 rounded-md p-3 mb-3 m-0">
                {t.content}
              </p>
              {t.variables.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {t.variables.map((v) => (
                    <span key={v} className="badge badge-info">{`{{${v}}}`}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
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
              onClick={() => { setShowModal(false); setEditingTemplate(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl"
            >
              <h2 className="text-lg font-bold mb-4">
                {editingTemplate ? "Modifier le template" : "Nouveau template SMS"}
              </h2>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="label">Nom *</label>
                  <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="label">Contenu *</label>
                  <textarea className="input-field min-h-[100px]" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required placeholder="Bonjour {{prenom}}, votre rendez-vous est confirme pour..." />
                  <p className="text-xs text-slate-400 mt-1">Utilisez {"{{variable}}"} pour les champs dynamiques</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => { setShowModal(false); setEditingTemplate(null); }} className="btn-secondary">Annuler</button>
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? (editingTemplate ? "Modification..." : "Creation...") : (editingTemplate ? "Modifier" : "Creer")}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
