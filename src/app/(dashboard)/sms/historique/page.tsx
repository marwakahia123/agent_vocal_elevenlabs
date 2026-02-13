"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatPhone } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import type { SmsHistoryEntry } from "@/types/database";

const PAGE_SIZE = 20;

const STATUS_MAP: Record<string, { icon: string; color: string; label: string }> = {
  pending: { icon: "clock", color: "#D97706", label: "En attente" },
  sent: { icon: "check", color: "#2563EB", label: "Envoye" },
  delivered: { icon: "check", color: "#059669", label: "Livre" },
  failed: { icon: "x", color: "#DC2626", label: "Echoue" },
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "delivered":
    case "sent":
      return <CheckCircle size={14} />;
    case "failed":
      return <XCircle size={14} />;
    default:
      return <Clock size={14} />;
  }
}

export default function SmsHistoriquePage() {
  const [messages, setMessages] = useState<SmsHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedSms, setSelectedSms] = useState<SmsHistoryEntry | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("sms_history")
        .select("*, contact:contacts(first_name, last_name)", { count: "exact" })
        .eq("user_id", user.id)
        .order("sent_at", { ascending: false })
        .range(from, to);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (search.trim()) {
        query = query.or(`phone_to.ilike.%${search}%,content.ilike.%${search}%`);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setMessages((data as SmsHistoryEntry[]) || []);
      setTotalCount(count || 0);
    } catch {
      setMessages([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Historique SMS</h1>
          <p className="text-sm text-slate-500 mt-1">Consultez l&apos;historique des SMS envoyes</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-[1_1_250px]">
            <label className="label">
              <Search size={14} className="inline mr-1 align-middle" /> Recherche
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Rechercher par telephone ou contenu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-[0_1_180px]">
            <label className="label">Statut</label>
            <select
              className="input-field"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Tous</option>
              <option value="pending">En attente</option>
              <option value="sent">Envoye</option>
              <option value="delivered">Livre</option>
              <option value="failed">Echoue</option>
            </select>
          </div>
          {(search || statusFilter !== "all") && (
            <button
              className="btn-ghost mb-0.5"
              onClick={() => { setSearch(""); setStatusFilter("all"); }}
            >
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
        </div>
      ) : messages.length === 0 ? (
        <div className="empty-state">
          <MessageSquare className="empty-state-icon" />
          <p className="empty-state-title">Aucun SMS</p>
          <p className="empty-state-desc">
            {search || statusFilter !== "all"
              ? "Aucun SMS ne correspond a vos filtres"
              : "L'historique de vos envois apparaitra ici"}
          </p>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Destinataire</th>
                  <th>Contenu</th>
                  <th className="hidden md:table-cell">Statut</th>
                  <th className="hidden md:table-cell">Envoye le</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => {
                  const s = STATUS_MAP[msg.status] || STATUS_MAP.pending;
                  const contact = msg.contact as unknown as { first_name: string; last_name: string } | null;
                  return (
                    <tr
                      key={msg.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedSms(msg)}
                    >
                      <td>
                        <div>
                          <div className="font-medium text-slate-900">
                            {contact ? `${contact.first_name} ${contact.last_name}` : formatPhone(msg.phone_to)}
                          </div>
                          {contact && <div className="text-xs text-slate-400">{formatPhone(msg.phone_to)}</div>}
                        </div>
                      </td>
                      <td>
                        <p className="m-0 max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap text-sm text-slate-600">
                          {msg.content}
                        </p>
                      </td>
                      <td className="hidden md:table-cell">
                        <span className="flex items-center gap-1 text-[0.8125rem]" style={{ color: s.color }}>
                          <StatusIcon status={msg.status} /> {s.label}
                        </span>
                      </td>
                      <td className="hidden md:table-cell text-[0.8125rem] text-slate-500">
                        {formatDateTime(msg.sent_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-[0.8125rem] text-slate-500">
                {totalCount} SMS au total
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

      {/* SMS Detail Modal */}
      <AnimatePresence>
        {selectedSms && (() => {
          const s = STATUS_MAP[selectedSms.status] || STATUS_MAP.pending;
          const contact = selectedSms.contact as unknown as { first_name: string; last_name: string } | null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setSelectedSms(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-auto"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <MessageSquare size={18} className="text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-slate-900 m-0">
                        {contact ? `${contact.first_name} ${contact.last_name}` : "SMS"}
                      </h2>
                      <div className="text-sm text-slate-500">{formatPhone(selectedSms.phone_to)}</div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedSms(null)} className="btn-ghost p-1 shrink-0">
                    <X size={20} />
                  </button>
                </div>

                {/* SMS content bubble */}
                <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4">
                  <p className="text-[0.875rem] text-slate-800 leading-relaxed whitespace-pre-wrap m-0">
                    {selectedSms.content}
                  </p>
                </div>

                {/* Details */}
                <div className="flex flex-col gap-3">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Statut</span>
                    <span
                      className="flex items-center gap-1.5 text-sm font-medium"
                      style={{ color: s.color }}
                    >
                      <StatusIcon status={selectedSms.status} />
                      {s.label}
                    </span>
                  </div>

                  {/* Sent date */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Envoye le</span>
                    <span className="text-sm text-slate-900">
                      {formatDateTime(selectedSms.sent_at)}
                    </span>
                  </div>

                  {/* Delivered date */}
                  {selectedSms.delivered_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Livre le</span>
                      <span className="text-sm text-slate-900">
                        {formatDateTime(selectedSms.delivered_at)}
                      </span>
                    </div>
                  )}

                  {/* Error message */}
                  {selectedSms.error_message && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-1">
                      <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700 m-0">{selectedSms.error_message}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
