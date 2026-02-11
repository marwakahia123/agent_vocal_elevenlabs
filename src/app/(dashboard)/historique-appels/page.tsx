"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneForwarded,
  Monitor,
  FlaskConical,
  Calendar,
  Clock,
  Filter,
  RefreshCw,
  Download,
  Bot,
  Play,
  Pause,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { listConversations } from "@/lib/elevenlabs";
import { createClient } from "@/lib/supabase/client";
import type { DbConversation } from "@/types/elevenlabs";

interface EnrichedConversation extends DbConversation {
  agent?: { name: string } | null;
  agent_id?: string | null;
}

const CALL_TYPE_LABELS: Record<string, string> = {
  inbound: "Entrant",
  outbound: "Sortant",
  widget: "Widget",
  test: "Test",
};

const STATUS_LABELS: Record<string, string> = {
  active: "En cours",
  ended: "Termine",
  error: "Echoue",
};

const STATUS_BADGE: Record<string, string> = {
  active: "badge-info",
  ended: "badge-success",
  error: "badge-danger",
};

function getDisplayStatus(status: string, duration: number | null) {
  if (status === "ended" && (!duration || duration === 0)) {
    return { label: "Pas de reponse", badge: "badge-warning" };
  }
  return { label: STATUS_LABELS[status] || status, badge: STATUS_BADGE[status] || "badge-neutral" };
}

function CallTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "inbound":
      return <PhoneIncoming size={14} />;
    case "outbound":
      return <PhoneOutgoing size={14} />;
    case "widget":
      return <Monitor size={14} />;
    case "test":
      return <FlaskConical size={14} />;
    default:
      return <Phone size={14} />;
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AudioPlayer({ elevenlabsConversationId }: { elevenlabsConversationId: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadAudio = async () => {
    if (audioUrl) {
      if (audioRef.current) {
        if (playing) {
          audioRef.current.pause();
          setPlaying(false);
        } else {
          try {
            await audioRef.current.play();
            setPlaying(true);
          } catch {
            setPlaying(false);
          }
        }
      }
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-conversation-audio`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ elevenlabsConversationId }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error("Audio fetch error:", res.status, errText);
        throw new Error("Audio non disponible");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => { setPlaying(false); toast.error("Format audio non supporte"); };
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } catch {
      toast.error("Audio non disponible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (audioRef.current) audioRef.current.pause();
    };
  }, [audioUrl]);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); loadAudio(); }}
      disabled={loading}
      className="badge badge-warning border-none cursor-pointer inline-flex items-center gap-1"
      style={{ backgroundColor: playing ? "#f1f5f9" : undefined }}
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : playing ? (
        <Pause size={12} />
      ) : (
        <Play size={12} />
      )}
      {loading ? "..." : playing ? "Pause" : "Audio"}
    </button>
  );
}

export default function HistoriqueAppelsPage() {
  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listConversations();
      setConversations((data.conversations as EnrichedConversation[]) || []);
    } catch {
      toast.error("Erreur lors du chargement de l'historique");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

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

  const filtered = conversations.filter((c) => {
    if (typeFilter !== "all" && c.call_type !== typeFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (agentFilter !== "all" && c.agent_id !== agentFilter) return false;
    if (dateFilter) {
      const convDate = new Date(c.started_at).toISOString().split("T")[0];
      if (convDate !== dateFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const agentName = (c.agent as { name: string } | null)?.name?.toLowerCase() || "";
      const phone = c.caller_phone?.toLowerCase() || "";
      return agentName.includes(q) || phone.includes(q);
    }
    return true;
  });

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("Aucune donnee a exporter");
      return;
    }
    const headers = ["Date", "Agent", "Duree", "Type", "Status", "Telephone", "Transfere vers"];
    const rows = filtered.map((c) => [
      formatDate(c.started_at),
      (c.agent as { name: string } | null)?.name || "N/A",
      formatDuration(c.duration_seconds),
      CALL_TYPE_LABELS[c.call_type || "test"] || c.call_type,
      getDisplayStatus(c.status, c.duration_seconds).label,
      c.caller_phone || "",
      c.transferred_to || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historique-appels-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV telecharge");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Historique des appels</h1>
          <p className="text-sm text-slate-500 mt-1">Consultez et filtrez toutes vos conversations</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
            <Download size={16} /> Exporter CSV
          </button>
          <button onClick={fetchConversations} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Actualiser
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-[1_1_250px]">
            <label className="label">
              <Search size={14} className="inline mr-1 align-middle" /> Recherche
            </label>
            <input type="text" className="input-field" placeholder="Rechercher par agent ou telephone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-[0_1_180px]">
            <label className="label">
              <Calendar size={14} className="inline mr-1 align-middle" /> Date
            </label>
            <input type="date" className="input-field" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
          <div className="flex-[0_1_160px]">
            <label className="label">
              <Filter size={14} className="inline mr-1 align-middle" /> Type
            </label>
            <select className="input-field" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Tous les types</option>
              <option value="inbound">Entrant</option>
              <option value="outbound">Sortant</option>
              <option value="widget">Widget</option>
              <option value="test">Test</option>
            </select>
          </div>
          <div className="flex-[0_1_200px]">
            <label className="label">
              <Bot size={14} className="inline mr-1 align-middle" /> Agent
            </label>
            <select className="input-field" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="all">Tous les agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-[0_1_160px]">
            <label className="label">Status</label>
            <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tous</option>
              <option value="ended">Termine</option>
              <option value="active">En cours</option>
              <option value="error">Echoue</option>
            </select>
          </div>
          {(search || dateFilter || typeFilter !== "all" || statusFilter !== "all" || agentFilter !== "all") && (
            <button
              className="btn-ghost mb-0.5"
              onClick={() => { setSearch(""); setDateFilter(""); setTypeFilter("all"); setStatusFilter("all"); setAgentFilter("all"); }}
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
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Phone size={48} className="empty-state-icon" />
            <p className="empty-state-title">Aucun appel trouve</p>
            <p className="empty-state-desc">
              {search || dateFilter || typeFilter !== "all" || statusFilter !== "all" || agentFilter !== "all"
                ? "Essayez de modifier vos filtres"
                : "Vos appels apparaitront ici une fois effectues"}
            </p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Agent</th>
                <th><Clock size={14} className="inline mr-1 align-middle" />Duree</th>
                <th>Type</th>
                <th>Status</th>
                <th>Telephone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((conv) => (
                <tr
                  key={conv.id}
                  onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                  className="cursor-pointer"
                >
                  <td>{formatDate(conv.started_at)}</td>
                  <td className="font-medium text-slate-900">
                    {(conv.agent as { name: string } | null)?.name || "—"}
                  </td>
                  <td>{formatDuration(conv.duration_seconds)}</td>
                  <td>
                    <span className="badge badge-info inline-flex items-center gap-1">
                      <CallTypeIcon type={conv.call_type || "test"} />
                      {CALL_TYPE_LABELS[conv.call_type || "test"] || conv.call_type}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 flex-wrap">
                      {(() => {
                        const ds = getDisplayStatus(conv.status, conv.duration_seconds);
                        return <span className={`badge ${ds.badge}`}>{ds.label}</span>;
                      })()}
                      {conv.transferred_to && (
                        <span className={`badge inline-flex items-center gap-1 ${conv.transfer_status === "success" ? "badge-warning" : "badge-danger"}`}>
                          <PhoneForwarded size={12} />
                          Transfere
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{conv.caller_phone || "—"}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {conv.elevenlabs_conversation_id && (
                        <AudioPlayer elevenlabsConversationId={conv.elevenlabs_conversation_id} />
                      )}
                      {conv.messages && conv.messages.length > 0 && (
                        <span className="badge inline-flex items-center gap-1">
                          <MessageSquare size={12} /> {conv.messages.length}
                        </span>
                      )}
                      {expandedId === conv.id
                        ? <ChevronUp size={16} className="text-slate-400" />
                        : <ChevronDown size={16} className="text-slate-400" />
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Expanded transcript */}
          {expandedId && (() => {
            const conv = filtered.find((c) => c.id === expandedId);
            if (!conv) return null;
            const hasMessages = conv.messages && conv.messages.length > 0;
            return (
              <div className="border border-slate-200 rounded-b-lg bg-slate-50 p-4 max-h-[400px] overflow-y-auto">
                {hasMessages ? (
                  <div className="flex flex-col gap-2">
                    {conv.messages
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.source === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-1.5 text-[0.8rem] ${
                              msg.source === "user"
                                ? "bg-slate-900 text-white rounded-br-sm"
                                : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                            }`}
                          >
                            <p className="m-0">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    {conv.transferred_to && (
                      <div className="flex justify-center mt-2">
                        <div className={`inline-flex items-center gap-1.5 text-[0.75rem] px-3 py-1 rounded-full border ${
                          conv.transfer_status === "success"
                            ? "text-amber-600 bg-amber-50 border-amber-200"
                            : "text-red-600 bg-red-50 border-red-200"
                        }`}>
                          <PhoneForwarded size={12} />
                          Appel transfere vers {conv.transferred_to}
                          {conv.transfer_status === "failed" && " (echoue)"}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-slate-400 text-[0.8rem]">
                    Aucun message enregistre
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="mt-4 text-[0.8125rem] text-slate-500">
          {filtered.length} appel{filtered.length > 1 ? "s" : ""} affiche{filtered.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
