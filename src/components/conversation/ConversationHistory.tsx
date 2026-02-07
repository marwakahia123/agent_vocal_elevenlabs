"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Clock, MessageSquare, ChevronDown, ChevronUp, Play, Pause, PhoneIncoming, FlaskConical, Loader2 } from "lucide-react";
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
    <button
      onClick={(e) => { e.stopPropagation(); loadAudio(); }}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.7rem",
        fontWeight: 500,
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        border: "1px solid #FFEDD5",
        backgroundColor: playing ? "#FFF7ED" : "white",
        color: "#F97316",
        cursor: loading ? "wait" : "pointer",
      }}
    >
      {loading ? (
        <Loader2 style={{ height: "0.7rem", width: "0.7rem", animation: "spin 1s linear infinite" }} />
      ) : playing ? (
        <Pause style={{ height: "0.7rem", width: "0.7rem" }} />
      ) : (
        <Play style={{ height: "0.7rem", width: "0.7rem" }} />
      )}
      {loading ? "..." : playing ? "Pause" : "Audio"}
    </button>
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
        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "1rem" }}>
          Historique des conversations
        </h3>
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
          <div style={{
            width: "1.5rem",
            height: "1.5rem",
            border: "3px solid #FFEDD5",
            borderTopColor: "#F97316",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }} />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111827", marginBottom: "1rem" }}>
        Historique des conversations
        <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "#6b7280", marginLeft: "0.5rem" }}>
          ({conversations.length})
        </span>
      </h3>

      {conversations.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem 0", color: "#9ca3af", fontSize: "0.875rem" }}>
          <Clock style={{ height: "2rem", width: "2rem", margin: "0 auto 0.5rem", color: "#d1d5db" }} />
          <p>Aucune conversation enregistree</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {conversations.map((conv) => {
            const CallIcon = CALL_TYPE_ICONS[conv.call_type || "test"] || FlaskConical;
            return (
              <div
                key={conv.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  overflow: "hidden",
                }}
              >
                {/* Conversation header */}
                <button
                  onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CallIcon style={{ height: "0.875rem", width: "0.875rem", color: "#9ca3af" }} />
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.7rem",
                      fontWeight: 500,
                      padding: "0.125rem 0.5rem",
                      borderRadius: "9999px",
                      backgroundColor: conv.status === "ended" ? "#f3f4f6" : conv.status === "active" ? "#dcfce7" : "#fef2f2",
                      color: conv.status === "ended" ? "#6b7280" : conv.status === "active" ? "#15803d" : "#dc2626",
                    }}>
                      {conv.status === "ended" ? "Terminee" : conv.status === "active" ? "Active" : "Erreur"}
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "#374151" }}>
                      {formatDate(conv.started_at)}
                    </span>
                    {conv.caller_phone && (
                      <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>
                        {conv.caller_phone}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {conv.elevenlabs_conversation_id && (
                      <AudioPlayer elevenlabsConversationId={conv.elevenlabs_conversation_id} />
                    )}
                    <span style={{ fontSize: "0.75rem", color: "#9ca3af", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Clock style={{ height: "0.75rem", width: "0.75rem" }} />
                      {formatDuration(conv.duration_seconds)}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#9ca3af", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <MessageSquare style={{ height: "0.75rem", width: "0.75rem" }} />
                      {conv.messages?.length || 0}
                    </span>
                    {expandedId === conv.id
                      ? <ChevronUp style={{ height: "1rem", width: "1rem", color: "#9ca3af" }} />
                      : <ChevronDown style={{ height: "1rem", width: "1rem", color: "#9ca3af" }} />
                    }
                  </div>
                </button>

                {/* Expanded messages */}
                {expandedId === conv.id && conv.messages && conv.messages.length > 0 && (
                  <div style={{
                    borderTop: "1px solid #e5e7eb",
                    padding: "0.75rem 1rem",
                    backgroundColor: "#f9fafb",
                    maxHeight: "300px",
                    overflowY: "auto",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {conv.messages
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        .map((msg) => (
                        <div
                          key={msg.id}
                          style={{
                            display: "flex",
                            justifyContent: msg.source === "user" ? "flex-end" : "flex-start",
                          }}
                        >
                          <div style={{
                            maxWidth: "85%",
                            borderRadius: "0.75rem",
                            padding: "0.375rem 0.75rem",
                            fontSize: "0.8rem",
                            ...(msg.source === "user"
                              ? {
                                  backgroundColor: "#F97316",
                                  color: "white",
                                  borderBottomRightRadius: "0.25rem",
                                }
                              : {
                                  backgroundColor: "white",
                                  color: "#1f2937",
                                  border: "1px solid #e5e7eb",
                                  borderBottomLeftRadius: "0.25rem",
                                }),
                          }}>
                            <p style={{ margin: 0 }}>{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {expandedId === conv.id && (!conv.messages || conv.messages.length === 0) && (
                  <div style={{
                    borderTop: "1px solid #e5e7eb",
                    padding: "1rem",
                    backgroundColor: "#f9fafb",
                    textAlign: "center",
                    color: "#9ca3af",
                    fontSize: "0.8rem",
                  }}>
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
