"use client";

import { useState, useEffect } from "react";
import { Plus, Ticket, AlertCircle, X, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
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
      // Refresh comments
      const { data } = await supabase
        .from("ticket_comments")
        .select("*")
        .eq("ticket_id", selectedTicket.id)
        .order("created_at", { ascending: true });
      setComments((data as TicketComment[]) || []);
    }
  }

  const statusMap: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: "#EFF6FF", color: "#2563EB", label: "Ouvert" },
    in_progress: { bg: "#FFF7ED", color: "#EA580C", label: "En cours" },
    waiting: { bg: "#FEF3C7", color: "#D97706", label: "En attente" },
    resolved: { bg: "#ECFDF5", color: "#059669", label: "Resolu" },
    closed: { bg: "#f3f4f6", color: "#6b7280", label: "Ferme" },
  };

  const priorityMap: Record<string, { bg: string; color: string; label: string }> = {
    low: { bg: "#f3f4f6", color: "#6b7280", label: "Basse" },
    medium: { bg: "#FFF7ED", color: "#EA580C", label: "Moyenne" },
    high: { bg: "#FEF3C7", color: "#D97706", label: "Haute" },
    urgent: { bg: "#FEE2E2", color: "#DC2626", label: "Urgente" },
  };

  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>Tickets Support</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>Gerez les demandes de support</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Plus size={16} /> Nouveau ticket
        </button>
      </div>

      {/* Filters */}
      <div className="tabs" style={{ marginBottom: "1rem" }}>
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
              <span style={{ marginLeft: "0.375rem", fontSize: "0.75rem", opacity: 0.7 }}>
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
                  <tr key={ticket.id} style={{ cursor: "pointer" }} onClick={() => openTicketDetail(ticket)}>
                    <td style={{ fontWeight: 500 }}>#{ticket.ticket_number}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {ticket.priority === "urgent" && <AlertCircle size={14} style={{ color: "#DC2626" }} />}
                        <span style={{ fontWeight: 500, color: "#111827" }}>{ticket.subject}</span>
                      </div>
                    </td>
                    <td><span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span></td>
                    <td><span className="badge" style={{ backgroundColor: p.bg, color: p.color }}>{p.label}</span></td>
                    <td style={{ textTransform: "capitalize" }}>{ticket.category.replace("_", " ")}</td>
                    <td style={{ fontSize: "0.8125rem", color: "#6b7280" }}>{formatRelative(ticket.created_at)}</td>
                    <td>
                      <button
                        className="btn-ghost"
                        style={{ padding: "0.25rem", color: "#ef4444" }}
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
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowModal(false)} />
          <div style={{ position: "relative", backgroundColor: "white", borderRadius: "1rem", padding: "1.5rem", width: "100%", maxWidth: "28rem", margin: "0 1rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>Nouveau ticket</h2>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="label">Sujet *</label>
                <input className="input-field" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
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
                <textarea className="input-field" style={{ minHeight: "100px" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
                <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creation..." : "Creer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket detail modal */}
      {selectedTicket && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setSelectedTicket(null)} />
          <div style={{ position: "relative", backgroundColor: "white", borderRadius: "1rem", padding: "1.5rem", width: "100%", maxWidth: "36rem", margin: "0 1rem", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>#{selectedTicket.ticket_number}</div>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#111827", margin: "0.25rem 0 0" }}>{selectedTicket.subject}</h2>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="btn-ghost" style={{ padding: "0.25rem" }}>
                <X size={20} />
              </button>
            </div>

            {/* Status + Priority */}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#6b7280", display: "block", marginBottom: "0.25rem" }}>Statut</label>
                <select
                  className="input-field"
                  style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem", width: "auto" }}
                  value={selectedTicket.status}
                  onChange={(e) => handleStatusChange(selectedTicket.id, e.target.value)}
                >
                  {Object.entries(statusMap).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#6b7280", display: "block", marginBottom: "0.25rem" }}>Priorite</label>
                <span className="badge" style={{ backgroundColor: (priorityMap[selectedTicket.priority] || priorityMap.medium).bg, color: (priorityMap[selectedTicket.priority] || priorityMap.medium).color }}>
                  {(priorityMap[selectedTicket.priority] || priorityMap.medium).label}
                </span>
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#6b7280", display: "block", marginBottom: "0.25rem" }}>Categorie</label>
                <span style={{ fontSize: "0.8125rem", color: "#374151", textTransform: "capitalize" }}>{selectedTicket.category.replace("_", " ")}</span>
              </div>
            </div>

            {/* Description */}
            {selectedTicket.description && (
              <div style={{ backgroundColor: "#f9fafb", borderRadius: "0.5rem", padding: "0.75rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#4b5563" }}>
                {selectedTicket.description}
              </div>
            )}

            {/* Comments */}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: "1rem", borderTop: "1px solid #f3f4f6", paddingTop: "0.75rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827", marginBottom: "0.75rem" }}>Commentaires</h3>
              {loadingComments ? (
                <div style={{ textAlign: "center", padding: "1rem", color: "#9ca3af", fontSize: "0.875rem" }}>Chargement...</div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1rem", color: "#9ca3af", fontSize: "0.875rem" }}>Aucun commentaire</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {comments.map((c) => (
                    <div key={c.id} style={{ backgroundColor: "#f9fafb", borderRadius: "0.5rem", padding: "0.625rem 0.75rem" }}>
                      <div style={{ fontSize: "0.875rem", color: "#374151" }}>{c.content}</div>
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>{formatRelative(c.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add comment */}
            <form onSubmit={handleAddComment} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                className="input-field"
                style={{ flex: 1 }}
                placeholder="Ajouter un commentaire..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ padding: "0.5rem 0.75rem" }} disabled={!newComment.trim()}>
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
