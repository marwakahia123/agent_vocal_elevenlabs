"use client";

import { useState, useEffect } from "react";
import { Plus, Ticket, AlertCircle, X, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import { formatRelative } from "@/lib/utils";
import type { SupportTicket, TicketComment } from "@/types/database";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "medium", category: "general" });
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  async function fetchTickets() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTickets((data as SupportTicket[]) || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) return;
    setSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Non connecte"); setSubmitting(false); return; }
    const { error } = await supabase.from("support_tickets").insert({
      user_id: user.id,
      subject: form.subject,
      description: form.description,
      priority: form.priority,
      category: form.category,
    });
    if (error) {
      toast.error("Erreur lors de la creation");
    } else {
      toast.success("Ticket cree !");
      setShowModal(false);
      setForm({ subject: "", description: "", priority: "medium", category: "general" });
      fetchTickets();
    }
    setSubmitting(false);
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const supabase = createClient();
    const { error } = await supabase.from("support_tickets").update({ status: newStatus }).eq("id", id);
    if (error) {
      toast.error("Erreur lors de la mise a jour");
    } else {
      toast.success("Statut mis a jour");
      fetchTickets();
      if (selectedTicket?.id === id) {
        setSelectedTicket({ ...selectedTicket, status: newStatus as SupportTicket["status"] });
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce ticket ?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("support_tickets").delete().eq("id", id);
    if (error) {
      toast.error("Erreur lors de la suppression");
    } else {
      toast.success("Ticket supprime");
      if (selectedTicket?.id === id) setSelectedTicket(null);
      fetchTickets();
    }
  }

  async function openTicketDetail(ticket: SupportTicket) {
    setSelectedTicket(ticket);
    setNewComment("");
    setLoadingComments(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("ticket_comments")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true });
    setComments((data as TicketComment[]) || []);
    setLoadingComments(false);
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !selectedTicket) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Non connecte"); return; }
    const { error } = await supabase.from("ticket_comments").insert({
      user_id: user.id,
      ticket_id: selectedTicket.id,
      content: newComment.trim(),
      is_internal: false,
    });
    if (error) {
      toast.error("Erreur lors de l'ajout du commentaire");
    } else {
      setNewComment("");
      const { data } = await supabase
        .from("ticket_comments")
        .select("*")
        .eq("ticket_id", selectedTicket.id)
        .order("created_at", { ascending: true });
      setComments((data as TicketComment[]) || []);
    }
  }

  const statusMap: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: "#dbeafe", color: "#1d4ed8", label: "Ouvert" },
    in_progress: { bg: "#f1f5f9", color: "#0f172a", label: "En cours" },
    waiting: { bg: "#fef3c7", color: "#D97706", label: "En attente" },
    resolved: { bg: "#d1fae5", color: "#047857", label: "Resolu" },
    closed: { bg: "#f1f5f9", color: "#64748b", label: "Ferme" },
  };

  const priorityMap: Record<string, { bg: string; color: string; label: string }> = {
    low: { bg: "#f1f5f9", color: "#64748b", label: "Basse" },
    medium: { bg: "#dbeafe", color: "#1d4ed8", label: "Moyenne" },
    high: { bg: "#fef3c7", color: "#D97706", label: "Haute" },
    urgent: { bg: "#fee2e2", color: "#DC2626", label: "Urgente" },
  };

  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

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
          <h1 className="text-xl font-semibold text-slate-900 m-0">Tickets Support</h1>
          <p className="text-sm text-slate-500 mt-1">Gerez les demandes de support</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouveau ticket
        </button>
      </div>

      {/* Filters */}
      <div className="tabs mb-4">
        {[
          { key: "all", label: "Tous" },
          { key: "open", label: "Ouverts" },
          { key: "in_progress", label: "En cours" },
          { key: "waiting", label: "En attente" },
          { key: "resolved", label: "Resolus" },
        ].map((f) => (
          <button key={f.key} className={`tab ${filter === f.key ? "active" : ""}`} onClick={() => setFilter(f.key)}>
            {f.label}
            {f.key !== "all" && (
              <span className="ml-1.5 text-xs opacity-70">
                ({tickets.filter((t) => f.key === "all" || t.status === f.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Ticket className="empty-state-icon" />
          <p className="empty-state-title">Aucun ticket</p>
          <p className="empty-state-desc">{filter === "all" ? "Aucun ticket de support" : "Aucun ticket avec ce statut"}</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Sujet</th>
                <th>Statut</th>
                <th>Priorite</th>
                <th>Categorie</th>
                <th>Cree</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => {
                const s = statusMap[ticket.status] || statusMap.open;
                const p = priorityMap[ticket.priority] || priorityMap.medium;
                return (
                  <tr key={ticket.id} className="cursor-pointer" onClick={() => openTicketDetail(ticket)}>
                    <td className="font-medium">#{ticket.ticket_number}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {ticket.priority === "urgent" && <AlertCircle size={14} className="text-red-600" />}
                        <span className="font-medium text-slate-900">{ticket.subject}</span>
                      </div>
                    </td>
                    <td><span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span></td>
                    <td><span className="badge" style={{ backgroundColor: p.bg, color: p.color }}>{p.label}</span></td>
                    <td className="capitalize">{ticket.category.replace("_", " ")}</td>
                    <td className="text-[0.8125rem] text-slate-500">{formatRelative(ticket.created_at)}</td>
                    <td>
                      <button
                        className="btn-ghost p-1 text-red-500"
                        onClick={(e) => { e.stopPropagation(); handleDelete(ticket.id); }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
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
              <h2 className="text-lg font-bold mb-4">Nouveau ticket</h2>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <label className="label">Sujet *</label>
                  <input className="input-field" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Priorite</label>
                    <select className="input-field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                      <option value="low">Basse</option>
                      <option value="medium">Moyenne</option>
                      <option value="high">Haute</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Categorie</label>
                    <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="general">General</option>
                      <option value="technical">Technique</option>
                      <option value="billing">Facturation</option>
                      <option value="feature_request">Fonctionnalite</option>
                      <option value="bug">Bug</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea className="input-field min-h-[100px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

      {/* Ticket detail modal */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedTicket(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-xl mx-4 max-h-[80vh] flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-[0.8125rem] text-slate-500">#{selectedTicket.ticket_number}</div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1 m-0">{selectedTicket.subject}</h2>
                </div>
                <button onClick={() => setSelectedTicket(null)} className="btn-ghost p-1"><X size={20} /></button>
              </div>

              {/* Status + Priority */}
              <div className="flex gap-3 items-center mb-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Statut</label>
                  <select
                    className="input-field text-[0.8125rem] py-1 px-2 w-auto"
                    value={selectedTicket.status}
                    onChange={(e) => handleStatusChange(selectedTicket.id, e.target.value)}
                  >
                    {Object.entries(statusMap).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Priorite</label>
                  <span className="badge" style={{ backgroundColor: (priorityMap[selectedTicket.priority] || priorityMap.medium).bg, color: (priorityMap[selectedTicket.priority] || priorityMap.medium).color }}>
                    {(priorityMap[selectedTicket.priority] || priorityMap.medium).label}
                  </span>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Categorie</label>
                  <span className="text-[0.8125rem] text-slate-700 capitalize">{selectedTicket.category.replace("_", " ")}</span>
                </div>
              </div>

              {/* Description */}
              {selectedTicket.description && (
                <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm text-slate-600">
                  {selectedTicket.description}
                </div>
              )}

              {/* Comments */}
              <div className="flex-1 overflow-y-auto mb-4 border-t border-slate-100 pt-3">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Commentaires</h3>
                {loadingComments ? (
                  <div className="text-center p-4 text-slate-400 text-sm">Chargement...</div>
                ) : comments.length === 0 ? (
                  <div className="text-center p-4 text-slate-400 text-sm">Aucun commentaire</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {comments.map((c) => (
                      <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2.5">
                        <div className="text-sm text-slate-700">{c.content}</div>
                        <div className="text-xs text-slate-400 mt-1">{formatRelative(c.created_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add comment */}
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  className="input-field flex-1"
                  placeholder="Ajouter un commentaire..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <button type="submit" className="btn-primary px-3 py-2" disabled={!newComment.trim()}>
                  <Send size={16} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
