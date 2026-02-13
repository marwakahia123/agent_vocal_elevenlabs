"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Edit2, Trash2, Bell, MessageSquare, Mail, Sparkles, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import type { NotificationTemplate } from "@/types/database";

type AgentType = "rdv" | "support" | "order" | "commercial";
type Channel = "sms" | "email";

const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  rdv: "Rendez-vous",
  support: "Support",
  order: "Commande",
  commercial: "Commercial",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  sms: "SMS",
  email: "Email",
};

const VARIABLES_BY_AGENT_TYPE: Record<AgentType, { key: string; label: string }[]> = {
  rdv: [
    { key: "client_name", label: "Nom du client" },
    { key: "client_phone", label: "Telephone" },
    { key: "client_email", label: "Email" },
    { key: "date", label: "Date du RDV" },
    { key: "time", label: "Heure du RDV" },
    { key: "duration", label: "Duree (min)" },
    { key: "motif", label: "Motif" },
    { key: "meeting_link", label: "Lien visio" },
  ],
  support: [
    { key: "client_name", label: "Nom du client" },
    { key: "client_phone", label: "Telephone" },
    { key: "client_email", label: "Email" },
    { key: "ticket_number", label: "Numero de ticket" },
    { key: "subject", label: "Sujet du ticket" },
    { key: "message", label: "Message" },
  ],
  order: [
    { key: "client_name", label: "Nom du client" },
    { key: "client_phone", label: "Telephone" },
    { key: "client_email", label: "Email" },
    { key: "order_number", label: "Numero de commande" },
    { key: "items_list", label: "Liste des articles" },
    { key: "subtotal", label: "Sous-total" },
    { key: "tax_amount", label: "TVA" },
    { key: "total_amount", label: "Total TTC" },
    { key: "currency", label: "Devise" },
    { key: "notes", label: "Notes" },
    { key: "order_date", label: "Date de commande" },
  ],
  commercial: [
    { key: "client_name", label: "Nom du client" },
    { key: "client_phone", label: "Telephone" },
    { key: "client_email", label: "Email" },
    { key: "product_name", label: "Nom du produit" },
    { key: "message", label: "Message" },
    { key: "date", label: "Date du rendez-vous" },
    { key: "time", label: "Heure du rendez-vous" },
    { key: "motif", label: "Motif du rendez-vous" },
    { key: "meeting_link", label: "Lien visio" },
  ],
};

// Exemples pre-remplis par combinaison channel + agent_type
const EXAMPLE_TEMPLATES: Record<string, { name: string; subject?: string; content: string }> = {
  "sms_rdv": {
    name: "Confirmation RDV",
    content: "Bonjour {{client_name}}, votre rendez-vous est confirme pour le {{date}} a {{time}}. Duree: {{duration}} min. Motif: {{motif}}. A bientot !",
  },
  "sms_support": {
    name: "Notification Support",
    content: "Bonjour {{client_name}}, votre demande de support (ticket {{ticket_number}}) a ete prise en charge. {{message}}",
  },
  "sms_order": {
    name: "Confirmation Commande",
    content: "Bonjour {{client_name}}, votre commande {{order_number}} est confirmee !\n{{items_list}}\nTotal: {{total_amount}} {{currency}}\nMerci pour votre commande !",
  },
  "email_rdv": {
    name: "Confirmation RDV Email",
    subject: "Confirmation de votre rendez-vous du {{date}} a {{time}}",
    content: "Bonjour {{client_name}},\n\nVotre rendez-vous a bien ete confirme.\n\nDate : {{date}}\nHeure : {{time}}\nDuree : {{duration}} minutes\nMotif : {{motif}}\n\nSi vous souhaitez modifier ou annuler votre rendez-vous, veuillez nous contacter.\n\nCordialement",
  },
  "email_support": {
    name: "Notification Support Email",
    subject: "Suivi de votre demande — {{subject}}",
    content: "Bonjour {{client_name}},\n\nNous avons bien pris en charge votre demande (ticket {{ticket_number}}).\n\n{{message}}\n\nN'hesitez pas a nous recontacter si besoin.\n\nCordialement",
  },
  "email_order": {
    name: "Facture Commande Email",
    subject: "Facture — Commande {{order_number}}",
    content: "Bonjour {{client_name}},\n\nMerci pour votre commande {{order_number}} !\n\nDetails :\n{{items_list}}\n\nSous-total : {{subtotal}} {{currency}}\nTVA : {{tax_amount}} {{currency}}\nTotal : {{total_amount}} {{currency}}\n\nMerci pour votre confiance !",
  },
  "sms_commercial": {
    name: "Confirmation RDV Commercial",
    content: "Bonjour {{client_name}}, votre rendez-vous concernant {{product_name}} est confirme le {{date}} a {{time}}. Motif: {{motif}}. A bientot !",
  },
  "email_commercial": {
    name: "Confirmation RDV Commercial Email",
    subject: "Confirmation de votre rendez-vous — {{product_name}}",
    content: "Bonjour {{client_name}},\n\nSuite a notre echange, votre rendez-vous est confirme :\n\nDate : {{date}}\nHeure : {{time}}\nMotif : {{motif}}\nProduit : {{product_name}}\n\n{{message}}\n\nCordialement",
  },
};

const PRESET_COLORS = [
  { color: "#0f172a", label: "Slate" },
  { color: "#1e3a5f", label: "Navy" },
  { color: "#1e40af", label: "Bleu" },
  { color: "#7c3aed", label: "Violet" },
  { color: "#059669", label: "Vert" },
  { color: "#dc2626", label: "Rouge" },
  { color: "#ea580c", label: "Orange" },
  { color: "#ca8a04", label: "Or" },
];

// Donnees d'exemple realistes pour l'apercu live
const EXAMPLE_DATA: Record<AgentType, Record<string, string>> = {
  rdv: {
    client_name: "Jean Dupont",
    client_phone: "+33 6 12 34 56 78",
    client_email: "jean.dupont@email.com",
    date: "15/03/2026",
    time: "14:30",
    duration: "30",
    motif: "Consultation initiale",
    meeting_link: "https://meet.google.com/abc-defg-hij",
  },
  support: {
    client_name: "Marie Martin",
    client_phone: "+33 6 98 76 54 32",
    client_email: "marie.martin@email.com",
    ticket_number: "SAV-20260315-48291",
    subject: "Probleme de facturation",
    message: "Nous avons bien recu votre demande et un conseiller va la traiter dans les plus brefs delais.",
  },
  order: {
    client_name: "Pierre Bernard",
    client_phone: "+33 6 55 44 33 22",
    client_email: "pierre.bernard@email.com",
    order_number: "CMD-20260315-73842",
    items_list: "2x Pizza Margherita - 24.00 EUR\n1x Tiramisu - 8.50 EUR",
    subtotal: "32.50 EUR",
    tax_amount: "6.50 EUR",
    total_amount: "39.00 EUR",
    currency: "EUR",
    notes: "Sans oignons",
    order_date: "samedi 15 mars 2026",
  },
  commercial: {
    client_name: "Sophie Laurent",
    client_phone: "+33 6 77 88 99 00",
    client_email: "sophie.laurent@entreprise.fr",
    product_name: "Solution CRM Pro",
    message: "N'hesitez pas a nous recontacter pour toute question.",
    date: "20/03/2026",
    time: "10:00",
    motif: "Demonstration produit",
    meeting_link: "https://meet.google.com/abc-defg-hij",
  },
};

interface FormState {
  name: string;
  channel: Channel;
  agent_type: AgentType;
  subject: string;
  content: string;
  is_default: boolean;
  header_color: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  channel: "sms",
  agent_type: "rdv",
  subject: "",
  content: "",
  is_default: false,
  header_color: "#0f172a",
};

export default function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterAgentType, setFilterAgentType] = useState<AgentType | "all">("all");
  const [filterChannel, setFilterChannel] = useState<Channel | "all">("all");

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Live preview with example data
  const previewContent = useMemo(() => {
    if (!form.content) return "";
    const data = EXAMPLE_DATA[form.agent_type];
    return form.content.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? `{{${key}}}`);
  }, [form.content, form.agent_type]);

  const previewSubject = useMemo(() => {
    if (form.channel !== "email" || !form.subject) return "";
    const data = EXAMPLE_DATA[form.agent_type];
    return form.subject.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? `{{${key}}}`);
  }, [form.subject, form.channel, form.agent_type]);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTemplates((data as NotificationTemplate[]) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditingTemplate(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  }

  function openEdit(template: NotificationTemplate) {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      channel: template.channel,
      agent_type: template.agent_type,
      subject: template.subject || "",
      content: template.content,
      is_default: template.is_default,
      header_color: template.header_color || "#0f172a",
    });
    setShowModal(true);
  }

  function loadExample() {
    const key = `${form.channel}_${form.agent_type}`;
    const example = EXAMPLE_TEMPLATES[key];
    if (example) {
      setForm({
        ...form,
        name: form.name || example.name,
        subject: example.subject || "",
        content: example.content,
      });
      toast.success("Exemple charge !");
    }
  }

  function insertVariable(varKey: string, target: "content" | "subject") {
    const tag = `{{${varKey}}}`;
    if (target === "content" && contentRef.current) {
      const el = contentRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newContent = form.content.slice(0, start) + tag + form.content.slice(end);
      setForm({ ...form, content: newContent });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else if (target === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const newSubject = form.subject.slice(0, start) + tag + form.subject.slice(end);
      setForm({ ...form, subject: newSubject });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.content.trim()) return;
    if (form.channel === "email" && !form.subject.trim()) {
      toast.error("Le sujet est requis pour un template email");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();

    const vars = [...form.content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    if (form.channel === "email" && form.subject) {
      const subjectVars = [...form.subject.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const v of subjectVars) {
        if (!vars.includes(v)) vars.push(v);
      }
    }

    const payload = {
      name: form.name,
      channel: form.channel,
      agent_type: form.agent_type,
      subject: form.channel === "email" ? form.subject : null,
      content: form.content,
      variables: vars,
      is_default: form.is_default,
      header_color: form.channel === "email" ? form.header_color : "#0f172a",
    };

    if (editingTemplate) {
      const { error } = await supabase
        .from("notification_templates")
        .update(payload)
        .eq("id", editingTemplate.id);
      if (error) {
        toast.error("Erreur lors de la modification");
      } else {
        toast.success("Template modifie !");
        setShowModal(false);
        setEditingTemplate(null);
        setForm(INITIAL_FORM);
        fetchTemplates();
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Non connecte"); setSubmitting(false); return; }
      const { error } = await supabase.from("notification_templates").insert({
        ...payload,
        user_id: user.id,
      });
      if (error) {
        toast.error("Erreur lors de la creation");
      } else {
        toast.success("Template cree !");
        setShowModal(false);
        setForm(INITIAL_FORM);
        fetchTemplates();
      }
    }
    setSubmitting(false);
  }

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const supabase = createClient();
    const { error } = await supabase.from("notification_templates").delete().eq("id", deleteTarget);
    if (error) {
      toast.error("Erreur de suppression");
    } else {
      toast.success("Template supprime");
      fetchTemplates();
    }
    setDeleteTarget(null);
  }

  const filteredTemplates = templates.filter((t) => {
    if (filterAgentType !== "all" && t.agent_type !== filterAgentType) return false;
    if (filterChannel !== "all" && t.channel !== filterChannel) return false;
    return true;
  });

  const availableVars = VARIABLES_BY_AGENT_TYPE[form.agent_type] || [];

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
          <h1 className="text-xl font-semibold text-slate-900 m-0">Templates de notifications</h1>
          <p className="text-sm text-slate-500 mt-1">Gerez vos modeles SMS et Email pour tous les types d&apos;agents</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouveau template
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          className="input-field w-auto"
          value={filterAgentType}
          onChange={(e) => setFilterAgentType(e.target.value as AgentType | "all")}
        >
          <option value="all">Tous les agents</option>
          {(Object.keys(AGENT_TYPE_LABELS) as AgentType[]).map((k) => (
            <option key={k} value={k}>{AGENT_TYPE_LABELS[k]}</option>
          ))}
        </select>
        <select
          className="input-field w-auto"
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value as Channel | "all")}
        >
          <option value="all">Tous les canaux</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </select>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="empty-state">
          <Bell className="empty-state-icon" />
          <p className="empty-state-title">Aucun template</p>
          <p className="empty-state-desc">
            Creez vos modeles de notifications avec des variables comme {`{{client_name}}`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
          {filteredTemplates.map((t) => (
            <div key={t.id} className="card overflow-hidden">
              {/* Color bar for email templates */}
              {t.channel === "email" && (
                <div className="h-2 -mx-4 -mt-4 mb-3 rounded-t-lg" style={{ backgroundColor: t.header_color || "#0f172a" }} />
              )}

              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  {t.channel === "sms" ? <MessageSquare size={14} className="text-slate-400" /> : <Mail size={14} className="text-slate-400" />}
                  <h3 className="font-semibold text-slate-900 m-0 text-sm">{t.name}</h3>
                </div>
                <div className="flex gap-1">
                  <button className="btn-ghost p-1" onClick={() => openEdit(t)}><Edit2 size={14} /></button>
                  <button className="btn-ghost p-1 text-red-600" onClick={() => setDeleteTarget(t.id)}><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="flex gap-1.5 mb-3 flex-wrap">
                <span className="badge badge-info text-[0.6875rem]">{CHANNEL_LABELS[t.channel]}</span>
                <span className="badge badge-info text-[0.6875rem]">{AGENT_TYPE_LABELS[t.agent_type]}</span>
                {t.is_default && <span className="badge badge-info text-[0.6875rem]">Par defaut</span>}
              </div>

              {t.channel === "email" && t.subject && (
                <p className="text-xs text-slate-500 mb-1 m-0">
                  <strong>Sujet :</strong> {t.subject}
                </p>
              )}

              <p className="text-[0.8125rem] text-slate-600 bg-slate-50 rounded-md p-3 mb-3 m-0 whitespace-pre-wrap">
                {t.content}
              </p>

              {t.variables.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {t.variables.map((v) => (
                    <span key={v} className="badge badge-info text-[0.6875rem]">{`{{${v}}}`}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
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
              className="relative bg-white rounded-xl p-6 w-full max-w-5xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-lg font-bold mb-4">
                {editingTemplate ? "Modifier le template" : "Nouveau template de notification"}
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ============ LEFT COLUMN — Form ============ */}
                <form onSubmit={handleSubmit} id="template-form" className="flex flex-col gap-4">
                  {/* Name */}
                  <div>
                    <label className="label">Nom *</label>
                    <input
                      className="input-field"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      placeholder="Ex: Confirmation rendez-vous"
                    />
                  </div>

                  {/* Channel + Agent Type */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Canal *</label>
                      <select
                        className="input-field"
                        value={form.channel}
                        onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })}
                      >
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Type d&apos;agent *</label>
                      <select
                        className="input-field"
                        value={form.agent_type}
                        onChange={(e) => setForm({ ...form, agent_type: e.target.value as AgentType })}
                      >
                        {(Object.keys(AGENT_TYPE_LABELS) as AgentType[]).map((k) => (
                          <option key={k} value={k}>{AGENT_TYPE_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Load example button */}
                  {!editingTemplate && (
                    <button
                      type="button"
                      onClick={loadExample}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors self-start"
                    >
                      <Sparkles size={14} />
                      Charger un exemple pour {AGENT_TYPE_LABELS[form.agent_type]} ({CHANNEL_LABELS[form.channel]})
                    </button>
                  )}

                  {/* Subject (email only) */}
                  {form.channel === "email" && (
                    <div>
                      <label className="label">Sujet de l&apos;email *</label>
                      <input
                        ref={subjectRef}
                        className="input-field"
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        required
                        placeholder="Ex: Votre rendez-vous du {{date}}"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div>
                    <label className="label">Contenu *</label>
                    <textarea
                      ref={contentRef}
                      className="input-field min-h-[120px]"
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                      required
                      placeholder="Bonjour {{client_name}}, ..."
                    />
                  </div>

                  {/* Variables badges */}
                  <div>
                    <label className="label mb-1.5">Variables disponibles</label>
                    <p className="text-xs text-slate-400 mb-2">Cliquez pour inserer dans le contenu</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {availableVars.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => insertVariable(v.key, "content")}
                          className="badge badge-info cursor-pointer hover:bg-blue-200 transition-colors text-[0.6875rem]"
                          title={v.label}
                        >
                          {`{{${v.key}}}`}
                        </button>
                      ))}
                    </div>
                    {form.channel === "email" && (
                      <p className="text-xs text-slate-400 mt-2">
                        Astuce : les variables fonctionnent aussi dans le sujet de l&apos;email
                      </p>
                    )}
                  </div>

                  {/* Color picker (email only) */}
                  {form.channel === "email" && (
                    <div>
                      <label className="label mb-1.5">Couleur du header</label>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c.color}
                              type="button"
                              onClick={() => setForm({ ...form, header_color: c.color })}
                              className="w-7 h-7 rounded-full border-2 transition-all"
                              style={{
                                backgroundColor: c.color,
                                borderColor: form.header_color === c.color ? "#3b82f6" : "transparent",
                                transform: form.header_color === c.color ? "scale(1.15)" : "scale(1)",
                              }}
                              title={c.label}
                            />
                          ))}
                        </div>
                        <input
                          type="color"
                          value={form.header_color}
                          onChange={(e) => setForm({ ...form, header_color: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                        />
                      </div>
                    </div>
                  )}

                  {/* Default checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Template par defaut pour ce type</span>
                  </label>

                  {/* Actions */}
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowModal(false); setEditingTemplate(null); }}
                      className="btn-secondary"
                    >
                      Annuler
                    </button>
                    <button type="submit" disabled={submitting} className="btn-primary">
                      {submitting
                        ? (editingTemplate ? "Modification..." : "Creation...")
                        : (editingTemplate ? "Modifier" : "Creer")}
                    </button>
                  </div>
                </form>

                {/* ============ RIGHT COLUMN — Live Preview ============ */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye size={16} className="text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700">Apercu avec donnees d&apos;exemple</span>
                    <span className="badge badge-info text-[0.625rem]">{AGENT_TYPE_LABELS[form.agent_type]}</span>
                  </div>

                  {form.channel === "email" ? (
                    /* ---- Email Preview ---- */
                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50 flex-1">
                      {/* Header */}
                      <div
                        className="px-6 py-5 text-center transition-colors duration-200"
                        style={{ backgroundColor: form.header_color }}
                      >
                        <h3 className="text-white text-base font-bold m-0">
                          {previewSubject || form.name || "Sujet de l'email"}
                        </h3>
                      </div>
                      {/* Body */}
                      <div className="bg-white px-6 py-5">
                        {previewContent ? (
                          <>
                            <div
                              className="text-sm text-slate-700 leading-relaxed"
                              dangerouslySetInnerHTML={{
                                __html: previewContent
                                  .replace(/&/g, "&amp;")
                                  .replace(/</g, "&lt;")
                                  .replace(/>/g, "&gt;")
                                  .replace(/\n/g, "<br>"),
                              }}
                            />
                            {form.agent_type === "rdv" && (
                              <div className="text-center my-5">
                                <span
                                  className="inline-block text-white text-[15px] font-semibold py-3 px-7 rounded-lg"
                                  style={{ backgroundColor: "#3b82f6" }}
                                >
                                  Rejoindre la reunion en ligne
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-slate-400 italic m-0">
                            Saisissez du contenu pour voir l&apos;apercu...
                          </p>
                        )}
                      </div>
                      {/* Footer */}
                      <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-center">
                        <p className="text-xs text-slate-400 m-0">
                          Ce message a ete envoye automatiquement par HallCall.
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* ---- SMS Preview ---- */
                    <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 flex-1 flex flex-col">
                      {/* Phone frame */}
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-200">
                        <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center">
                          <MessageSquare size={14} className="text-slate-500" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-700 m-0">HallCall</p>
                          <p className="text-[0.625rem] text-slate-400 m-0">SMS</p>
                        </div>
                      </div>
                      {/* Message bubble */}
                      <div className="flex-1 flex flex-col justify-end">
                        {previewContent ? (
                          <div className="self-start max-w-[85%]">
                            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-slate-200">
                              <p className="text-sm text-slate-800 m-0 whitespace-pre-wrap leading-relaxed">
                                {previewContent}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 px-1">
                              <span className="text-[0.625rem] text-slate-400">14:30</span>
                              <span className={`text-[0.625rem] font-medium ${
                                previewContent.length > 160 ? "text-amber-500" : "text-slate-400"
                              }`}>
                                {previewContent.length} / 160 car.
                                {previewContent.length > 160 && ` (${Math.ceil(previewContent.length / 153)} SMS)`}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="self-start max-w-[85%]">
                            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-slate-200">
                              <p className="text-sm text-slate-400 italic m-0">
                                Saisissez du contenu pour voir l&apos;apercu...
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                <h2 className="text-lg font-bold m-0 text-slate-900">Supprimer le template</h2>
              </div>
              <p className="text-sm text-slate-600 mb-6">
                Cette action est irreversible. Le template sera definitivement supprime.
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
    </div>
  );
}
