"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useConversation } from "@elevenlabs/react";
import { toast } from "sonner";
import { Mic, Phone, PhoneOff, Volume2 } from "lucide-react";
import { getSignedUrl, startConversation as startConvDb, endConversation as endConvDb, saveMessage } from "@/lib/elevenlabs";
import { createClient } from "@/lib/supabase/client";

interface Props {
  agentId: string;
}

interface TranscriptEntry {
  source: "user" | "ai";
  message: string;
  timestamp: Date;
}

export default function ConversationPanel({ agentId }: Props) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [mode, setMode] = useState<string>("idle");
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [vadScore, setVadScore] = useState(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | null>(null);

  const addDebug = useCallback((msg: string) => {
    console.log("[ConvDebug]", msg);
    setDebugInfo((prev) => [...prev.slice(-9), `${new Date().toLocaleTimeString("fr-FR")} - ${msg}`]);
  }, []);

  const conversation = useConversation({
    onConnect: ({ conversationId }: { conversationId: string }) => {
      setIsConnected(true);
      setConnecting(false);
      addDebug(`Connecte (convId: ${conversationId})`);
      toast.success("Connecte a l'agent");
      // Store ElevenLabs conversation ID in DB for audio retrieval
      if (conversationIdRef.current && conversationId) {
        const supabase = createClient();
        supabase.from("conversations")
          .update({ elevenlabs_conversation_id: conversationId })
          .eq("id", conversationIdRef.current)
          .then(() => addDebug(`EL conv_id saved: ${conversationId}`));
      }
    },
    onDisconnect: (details?: unknown) => {
      setIsConnected(false);
      setMode("idle");
      // Log la raison de la deconnexion
      const detailStr = details ? JSON.stringify(details) : "aucun detail";
      addDebug(`Deconnecte: ${detailStr}`);
      console.error("[ConvDebug] Disconnect details:", details);
      // Terminer la conversation en base
      if (conversationIdRef.current) {
        endConvDb(conversationIdRef.current).catch(() => {});
        conversationIdRef.current = null;
      }
      toast.info("Conversation terminee");
    },
    onMessage: (props: { message: string; source: string; role: string }) => {
      const source = (props.role === "agent" ? "ai" : "user") as "user" | "ai";
      addDebug(`Message [${props.role}]: ${props.message.slice(0, 50)}...`);
      setTranscript((prev) => [
        ...prev,
        {
          source,
          message: props.message,
          timestamp: new Date(),
        },
      ]);
      // Sauvegarder le message en base
      if (conversationIdRef.current) {
        saveMessage(conversationIdRef.current, source, props.message).catch(() => {});
      }
    },
    onError: (message: string, context?: unknown) => {
      addDebug(`ERREUR: ${message} ${context ? JSON.stringify(context) : ""}`);
      toast.error(`Erreur: ${message}`);
      setConnecting(false);
    },
    onModeChange: ({ mode: newMode }: { mode: string }) => {
      setMode(newMode);
      addDebug(`Mode: ${newMode}`);
    },
    onStatusChange: ({ status }: { status: string }) => {
      addDebug(`Status: ${status}`);
    },
    onVadScore: ({ vadScore: score }: { vadScore: number }) => {
      setVadScore(score);
    },
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleStartConversation = useCallback(async () => {
    setConnecting(true);
    setTranscript([]);

    // 1. Creer la conversation en base
    try {
      const convData = await startConvDb(agentId);
      conversationIdRef.current = convData.id;
    } catch {
      // Si la sauvegarde echoue, on continue quand meme
    }

    // 2. Obtenir le signed URL et demarrer la session
    try {
      const data = await getSignedUrl(agentId);
      if (data.signed_url) {
        addDebug("Demarrage avec signed URL...");
        await conversation.startSession({ signedUrl: data.signed_url });
        return;
      }
    } catch (signedUrlError) {
      addDebug(`Signed URL echoue: ${signedUrlError}`);
    }

    // 3. Fallback: connexion directe (agent public)
    try {
      addDebug("Fallback: connexion directe...");
      await conversation.startSession({ agentId, connectionType: "websocket" });
    } catch (sessionError) {
      const msg = sessionError instanceof Error ? sessionError.message : String(sessionError);
      toast.error(`Erreur de connexion: ${msg}`);
      setConnecting(false);
    }
  }, [agentId, conversation]);

  const handleStopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#111827", margin: 0 }}>
          Tester l&apos;agent
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Status indicator */}
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            fontSize: "0.75rem",
            fontWeight: 500,
            padding: "0.25rem 0.625rem",
            borderRadius: "9999px",
            backgroundColor: isConnected ? "#dcfce7" : "#f3f4f6",
            color: isConnected ? "#15803d" : "#6b7280",
          }}>
            <span style={{
              height: "0.5rem",
              width: "0.5rem",
              borderRadius: "50%",
              backgroundColor: isConnected ? "#22c55e" : "#9ca3af",
              animation: isConnected ? "pulse 2s infinite" : "none",
            }} />
            {isConnected ? "Connecte" : "Deconnecte"}
          </span>

          {/* Speaking indicator */}
          {conversation.isSpeaking && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              fontSize: "0.75rem",
              fontWeight: 500,
              padding: "0.25rem 0.625rem",
              borderRadius: "9999px",
              backgroundColor: "#FFEDD5",
              color: "#EA580C",
            }}>
              <Volume2 style={{ height: "0.75rem", width: "0.75rem" }} />
              L&apos;agent parle...
            </span>
          )}
        </div>
      </div>

      {/* Transcript area */}
      <div style={{
        flex: 1,
        minHeight: "300px",
        maxHeight: "500px",
        overflowY: "auto",
        backgroundColor: "#f9fafb",
        borderRadius: "0.5rem",
        padding: "1rem",
        marginBottom: "1.5rem",
      }}>
        {transcript.length === 0 ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#9ca3af",
            fontSize: "0.875rem",
          }}>
            {isConnected
              ? "En attente... Parlez a votre agent !"
              : "Cliquez sur 'Demarrer' pour commencer la conversation"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {transcript.map((entry, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: entry.source === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div style={{
                  maxWidth: "80%",
                  borderRadius: "1rem",
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  ...(entry.source === "user"
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
                  <p style={{ margin: 0 }}>{entry.message}</p>
                  <span style={{ fontSize: "0.625rem", opacity: 0.6, display: "block", marginTop: "0.25rem" }}>
                    {entry.timestamp.toLocaleTimeString("fr-FR")}
                  </span>
                </div>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        {!isConnected ? (
          <button
            onClick={handleStartConversation}
            disabled={connecting}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 2rem", fontSize: "1rem" }}
          >
            {connecting ? (
              <>
                <div style={{
                  width: "1.25rem",
                  height: "1.25rem",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "white",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }} />
                Connexion...
              </>
            ) : (
              <>
                <Phone style={{ height: "1.25rem", width: "1.25rem" }} />
                Demarrer la conversation
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleStopConversation}
            className="btn-danger"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 2rem", fontSize: "1rem" }}
          >
            <PhoneOff style={{ height: "1.25rem", width: "1.25rem" }} />
            Terminer
          </button>
        )}
      </div>

      {/* Mode indicator + VAD */}
      {isConnected && (
        <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
          <p style={{ fontSize: "0.75rem", color: mode === "listening" ? "#15803d" : mode === "speaking" ? "#EA580C" : "#6b7280", margin: 0 }}>
            {mode === "listening" ? "En ecoute..." : mode === "speaking" ? "Agent parle..." : `Mode: ${mode}`}
          </p>
          {mode === "listening" && (
            <div style={{ marginTop: "0.375rem" }}>
              <div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: "0.125rem" }}>
                VAD: {vadScore.toFixed(2)} | Vol: {(conversation.getInputVolume?.() ?? 0).toFixed(2)}
              </div>
              <div style={{ height: "4px", backgroundColor: "#e5e7eb", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(vadScore * 100, 100)}%`,
                  backgroundColor: vadScore > 0.5 ? "#22c55e" : vadScore > 0.1 ? "#eab308" : "#ef4444",
                  transition: "width 0.1s",
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Microphone notice */}
      {!isConnected && (
        <p style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "center", marginTop: "0.75rem" }}>
          <Mic style={{ height: "0.75rem", width: "0.75rem", display: "inline", marginRight: "0.25rem", verticalAlign: "middle" }} />
          L&apos;acces au microphone sera demande au demarrage
        </p>
      )}

      {/* Debug panel */}
      {debugInfo.length > 0 && (
        <div style={{
          marginTop: "1rem",
          padding: "0.5rem",
          backgroundColor: "#1f2937",
          color: "#10b981",
          borderRadius: "0.375rem",
          fontSize: "0.675rem",
          fontFamily: "monospace",
          maxHeight: "120px",
          overflowY: "auto",
        }}>
          {debugInfo.map((info, i) => (
            <div key={i}>{info}</div>
          ))}
        </div>
      )}
    </div>
  );
}
