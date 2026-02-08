"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Clock, MessageSquare, ChevronDown, ChevronUp, Play, Pause, PhoneIncoming, PhoneForwarded, FlaskConical, Loader2 } from "lucide-react";
import { listConversations } from "@/lib/elevenlabs";
import { createClient } from "@/lib/supabase/client";
import type { DbConversation } from "@/types/elevenlabs";

interface Props {
  agentId: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("fr-FR", {
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

      if (!res.ok) throw new Error("Audio non disponible");

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
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); loadAudio(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); loadAudio(); } }}
      aria-disabled={loading}
      className={`inline-flex items-center gap-1 text-[0.7rem] font-medium px-2 py-0.5 rounded-full border border-slate-200 text-slate-700 ${
        playing ? "bg-slate-50" : "bg-white"
      } ${loading ? "cursor-wait opacity-60" : "cursor-pointer"}`}
    >
      {loading ? (
        <Loader2 className="h-[0.7rem] w-[0.7rem] animate-spin" />
      ) : playing ? (
        <Pause className="h-[0.7rem] w-[0.7rem]" />
      ) : (
        <Play className="h-[0.7rem] w-[0.7rem]" />
      )}
      {loading ? "..." : playing ? "Pause" : "Audio"}
    </span>
  );
}

const CALL_TYPE_ICONS: Record<string, typeof PhoneIncoming> = {
  inbound: PhoneIncoming,
  test: FlaskConical,
};

export default function ConversationHistory({ agentId }: Props) {
  const [conversations, setConversations] = useState<DbConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    listConversations(agentId)
      .then((data) => setConversations(data.conversations || []))
      .catch(() => toast.error("Impossible de charger l'historique"))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return (
      <div className="card">
        <h3 className="text-base font-bold text-slate-900 mb-4">
          Historique des conversations
        </h3>
        <div className="flex justify-center py-8">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-base font-bold text-slate-900 mb-4">
        Historique des conversations
        <span className="text-xs font-normal text-slate-500 ml-2">
          ({conversations.length})
        </span>
      </h3>

      {conversations.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">
          <Clock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          <p>Aucune conversation enregistree</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map((conv) => {
            const CallIcon = CALL_TYPE_ICONS[conv.call_type || "test"] || FlaskConical;
            return (
              <div
                key={conv.id}
                className="border border-slate-200 rounded-lg overflow-hidden"
              >
                {/* Conversation header */}
                <button
                  onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-transparent border-none cursor-pointer text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <CallIcon className="h-3.5 w-3.5 text-slate-400" />
                    <span className={`inline-flex items-center gap-1 text-[0.7rem] font-medium px-2 py-0.5 rounded-full ${
                      conv.status === "ended" ? "bg-slate-100 text-slate-500" :
                      conv.status === "active" ? "bg-emerald-50 text-emerald-700" :
                      "bg-red-50 text-red-600"
                    }`}>
                      {conv.status === "ended" ? "Terminee" : conv.status === "active" ? "Active" : "Erreur"}
                    </span>
                    {conv.transferred_to && (
                      <span className={`inline-flex items-center gap-1 text-[0.7rem] font-medium px-2 py-0.5 rounded-full ${
                        conv.transfer_status === "success" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
                      }`}>
                        <PhoneForwarded className="h-3 w-3" />
                        Transfere
                      </span>
                    )}
                    <span className="text-[0.8rem] text-slate-700">
                      {formatDate(conv.started_at)}
                    </span>
                    {conv.caller_phone && (
                      <span className="text-[0.7rem] text-slate-400">
                        {conv.caller_phone}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {conv.elevenlabs_conversation_id && (
                      <AudioPlayer elevenlabsConversationId={conv.elevenlabs_conversation_id} />
                    )}
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(conv.duration_seconds)}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {conv.messages?.length || 0}
                    </span>
                    {expandedId === conv.id
                      ? <ChevronUp className="h-4 w-4 text-slate-400" />
                      : <ChevronDown className="h-4 w-4 text-slate-400" />
                    }
                  </div>
                </button>

                {/* Expanded messages */}
                {expandedId === conv.id && conv.messages && conv.messages.length > 0 && (
                  <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 max-h-[300px] overflow-y-auto">
                    <div className="flex flex-col gap-2">
                      {conv.messages
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        .map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.source === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`max-w-[85%] rounded-xl px-3 py-1.5 text-[0.8rem] ${
                            msg.source === "user"
                              ? "bg-slate-900 text-white rounded-br-sm"
                              : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                          }`}>
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
                            <PhoneForwarded className="h-3 w-3" />
                            Appel transfere vers {conv.transferred_to}
                            {conv.transfer_status === "failed" && " (echoue)"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {expandedId === conv.id && (!conv.messages || conv.messages.length === 0) && (
                  <div className="border-t border-slate-200 p-4 bg-slate-50 text-center text-slate-400 text-[0.8rem]">
                    Aucun message enregistre
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
