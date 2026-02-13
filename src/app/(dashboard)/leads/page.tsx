"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Search, RefreshCw, ChevronLeft, ChevronRight, Star, X, Phone, Mail, Building2, Calendar, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { formatRelative } from "@/lib/utils";
import type { Lead } from "@/types/database";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "bg-slate-100 text-slate-600" },
  interested: { label: "Interesse", color: "bg-green-100 text-green-800" },
  not_interested: { label: "Pas interesse", color: "bg-red-100 text-red-800" },
  callback: { label: "A rappeler", color: "bg-amber-100 text-amber-800" },
  transferred: { label: "Transfere", color: "bg-blue-100 text-blue-800" },
  converted: { label: "Converti", color: "bg-purple-100 text-purple-800" },
};

function InterestStars({ level, size = 12 }: { level: number | null; size?: number }) {
  if (!level) return <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={i < level ? "text-amber-400 fill-amber-400" : "text-slate-200"}
        />
      ))}
    </div>
  );
}

function LeadDetailModal({
  lead,
  onClose,
  onStatusChange,
}: {
  lead: Lead;
  onClose: () => void;
  onStatusChange: (leadId: string, newStatus: string) => void;
}) {
  const statusInfo = STATUS_LABELS[lead.status] || STATUS_LABELS.pending;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const formatDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 m-0">
              {lead.contact_name || "Inconnu"}
            </h2>
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1.5 ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          <button onClick={onClose} className="btn-ghost p-1 -mt-1 -mr-1">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Contact</h3>
            <div className="space-y-2.5">
              {lead.contact_phone && (
                <div className="flex items-center gap-3">
                  <Phone size={15} className="text-slate-400 shrink-0" />
                  <a href={`tel:${lead.contact_phone}`} className="text-sm text-slate-700 hover:text-primary">
                    {lead.contact_phone}
                  </a>
                </div>
              )}
              {lead.contact_email && (
                <div className="flex items-center gap-3">
                  <Mail size={15} className="text-slate-400 shrink-0" />
                  <a href={`mailto:${lead.contact_email}`} className="text-sm text-slate-700 hover:text-primary">
                    {lead.contact_email}
                  </a>
                </div>
              )}
              {lead.contact_company && (
                <div className="flex items-center gap-3">
                  <Building2 size={15} className="text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700">{lead.contact_company}</span>
                </div>
              )}
              {!lead.contact_phone && !lead.contact_email && !lead.contact_company && (
                <p className="text-sm text-slate-400">Aucune information de contact</p>
              )}
            </div>
          </div>

          {/* Qualification */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Qualification</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Statut</label>
                <select
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border-0 cursor-pointer ${statusInfo.color}`}
                  value={lead.status}
                  onChange={(e) => onStatusChange(lead.id, e.target.value)}
                >
                  {Object.entries(STATUS_LABELS).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Niveau d&apos;interet</label>
                <InterestStars level={lead.interest_level} size={16} />
              </div>
            </div>
          </div>

          {/* Dates */}
          {(lead.callback_date || lead.appointment_date) && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Planification</h3>
              <div className="space-y-2.5">
                {lead.callback_date && (
                  <div className="flex items-center gap-3">
                    <Phone size={15} className="text-amber-500 shrink-0" />
                    <div>
                      <span className="text-xs text-slate-500">Rappel prevu</span>
                      <p className="text-sm text-slate-700 font-medium m-0">{formatDate(lead.callback_date)}</p>
                    </div>
                  </div>
                )}
                {lead.appointment_date && (
                  <div className="flex items-center gap-3">
                    <Calendar size={15} className="text-green-500 shrink-0" />
                    <div>
                      <span className="text-xs text-slate-500">Rendez-vous</span>
                      <p className="text-sm text-slate-700 font-medium m-0">{formatDate(lead.appointment_date)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Notes</h3>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-sm text-slate-700 whitespace-pre-wrap m-0">{lead.notes}</p>
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <Clock size={12} />
                <span>Cree {formatRelative(lead.created_at)}</span>
              </div>
              {lead.updated_at !== lead.created_at && (
                <div className="flex items-center gap-1.5">
                  <FileText size={12} />
                  <span>Modifie {formatRelative(lead.updated_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [interestFilter, setInterestFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filter !== "all") {
      query = query.eq("status", filter);
    }
    if (interestFilter !== "all") {
      query = query.eq("interest_level", parseInt(interestFilter));
    }
    if (search.trim()) {
      query = query.or(`contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%,contact_company.ilike.%${search}%,contact_email.ilike.%${search}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      toast.error("Erreur chargement des leads");
    } else {
      setLeads((data as Lead[]) || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [page, filter, interestFilter, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    setPage(1);
  }, [filter, interestFilter, search]);

  async function handleStatusChange(leadId: string, newStatus: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      toast.error("Erreur lors de la mise a jour");
    } else {
      toast.success("Statut mis a jour");
      if (selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus as Lead["status"] });
      }
      fetchLeads();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Leads</h1>
          <p className="text-sm text-slate-500 mt-1">
            Qualification et suivi des prospects contactes par vos agents commerciaux
          </p>
        </div>
        <button onClick={fetchLeads} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9"
            placeholder="Rechercher par nom, telephone, entreprise..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <select className="input-field w-auto" value={interestFilter} onChange={(e) => setInterestFilter(e.target.value)}>
          <option value="all">Tout interet</option>
          {[5, 4, 3, 2, 1].map((level) => (
            <option key={level} value={level}>{level} etoile{level > 1 ? "s" : ""}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-20">
          <TrendingUp size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 text-sm">
            {search || filter !== "all" || interestFilter !== "all" ? "Aucun lead trouve avec ces filtres" : "Aucun lead pour le moment"}
          </p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Entreprise</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Telephone</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Interet</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Rappel</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden xl:table-cell">Notes</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const statusInfo = STATUS_LABELS[lead.status] || STATUS_LABELS.pending;
                    return (
                      <tr
                        key={lead.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedLead(lead)}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <span className="text-sm font-medium text-slate-900">{lead.contact_name || "Inconnu"}</span>
                            {lead.contact_email && (
                              <div className="text-xs text-slate-400 mt-0.5">{lead.contact_email}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm text-slate-600">{lead.contact_company || "-"}</span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-sm text-slate-500">{lead.contact_phone || "-"}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <InterestStars level={lead.interest_level} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <select
                            className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${statusInfo.color}`}
                            value={lead.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                          >
                            {Object.entries(STATUS_LABELS).map(([key, val]) => (
                              <option key={key} value={key}>{val.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {lead.callback_date ? (
                            <span className="text-xs text-amber-600 font-medium">
                              {new Date(lead.callback_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : lead.appointment_date ? (
                            <span className="text-xs text-green-600 font-medium">
                              RDV {new Date(lead.appointment_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className="text-xs text-slate-500 line-clamp-2 max-w-[200px]">{lead.notes || "-"}</span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <span className="text-xs text-slate-400">{formatRelative(lead.created_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-[0.8125rem] text-slate-500">
                {totalCount} lead{totalCount > 1 ? "s" : ""} au total
              </span>
              <div className="pagination">
                <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i + 1;
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i;
                  } else {
                    p = page - 3 + i;
                  }
                  return (
                    <button
                      key={p}
                      className={`pagination-btn ${page === p ? "active" : ""}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Lead Detail Modal */}
      <AnimatePresence>
        {selectedLead && (
          <LeadDetailModal
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onStatusChange={handleStatusChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
