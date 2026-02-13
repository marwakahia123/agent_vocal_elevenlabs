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
      const detailStr = details ? JSON.stringify(details) : "aucun detail";
      addDebug(`Deconnecte: ${detailStr}`);
      console.error("[ConvDebug] Disconnect details:", details);
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

    try {
      const convData = await startConvDb(agentId);
      conversationIdRef.current = convData.id;
    } catch {
      // Si la sauvegarde echoue, on continue quand meme
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateOverrides: any = {
      agent: {
        prompt: {
          dynamic_variables: {
            current_date: new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
          },
        },
      },
    };

    try {
      const data = await getSignedUrl(agentId);
      if (data.signed_url) {
        addDebug("Demarrage avec signed URL...");
        await conversation.startSession({ signedUrl: data.signed_url, overrides: dateOverrides });
        return;
      }
    } catch (signedUrlError) {
      addDebug(`Signed URL echoue: ${signedUrlError}`);
    }

    try {
      addDebug("Fallback: connexion directe...");
      await conversation.startSession({ agentId, connectionType: "websocket", overrides: dateOverrides });
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
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-900 m-0">
          Tester l&apos;agent
        </h2>
        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            isConnected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}>
            <span className={`h-2 w-2 rounded-full ${
              isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
            }`} />
            {isConnected ? "Connecte" : "Deconnecte"}
          </span>

          {/* Speaking indicator */}
          {conversation.isSpeaking && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
              <Volume2 className="h-3 w-3" />
              L&apos;agent parle...
            </span>
          )}
        </div>
      </div>

      {/* Transcript area */}
      <div className="flex-1 min-h-[300px] max-h-[500px] overflow-y-auto bg-slate-50 rounded-lg p-4 mb-6">
        {transcript.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            {isConnected
              ? "En attente... Parlez a votre agent !"
              : "Cliquez sur 'Demarrer' pour commencer la conversation"}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {transcript.map((entry, i) => (
              <div
                key={i}
                className={`flex ${entry.source === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  entry.source === "user"
                    ? "bg-slate-900 text-white rounded-br-sm"
                    : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                }`}>
                  <p className="m-0">{entry.message}</p>
                  <span className="text-[0.625rem] opacity-60 block mt-1">
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
      <div className="flex items-center justify-center gap-4">
        {!isConnected ? (
          <button
            onClick={handleStartConversation}
            disabled={connecting}
            className="btn-primary flex items-center gap-2 px-8 py-3 text-base"
          >
            {connecting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connexion...
              </>
            ) : (
              <>
                <Phone className="h-5 w-5" />
                Demarrer la conversation
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleStopConversation}
            className="btn-danger flex items-center gap-2 px-8 py-3 text-base"
          >
            <PhoneOff className="h-5 w-5" />
            Terminer
          </button>
        )}
      </div>

      {/* Mode indicator + VAD */}
      {isConnected && (
        <div className="text-center mt-2">
          <p className={`text-xs m-0 ${
            mode === "listening" ? "text-emerald-600" : mode === "speaking" ? "text-slate-700" : "text-slate-500"
          }`}>
            {mode === "listening" ? "En ecoute..." : mode === "speaking" ? "Agent parle..." : `Mode: ${mode}`}
          </p>
          {mode === "listening" && (
            <div className="mt-1.5">
              <div className="text-[0.625rem] text-slate-500 mb-0.5">
                VAD: {vadScore.toFixed(2)} | Vol: {(conversation.getInputVolume?.() ?? 0).toFixed(2)}
              </div>
              <div className="h-1 bg-slate-200 rounded-sm overflow-hidden">
                <div
                  className="h-full transition-[width] duration-100"
                  style={{
                    width: `${Math.min(vadScore * 100, 100)}%`,
                    backgroundColor: vadScore > 0.5 ? "#22c55e" : vadScore > 0.1 ? "#eab308" : "#ef4444",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Microphone notice */}
      {!isConnected && (
        <p className="text-xs text-slate-400 text-center mt-3">
          <Mic className="h-3 w-3 inline mr-1 align-middle" />
          L&apos;acces au microphone sera demande au demarrage
        </p>
      )}

      {/* Debug panel */}
      {debugInfo.length > 0 && (
        <div className="mt-4 p-2 bg-slate-800 text-emerald-400 rounded-md text-[0.675rem] font-mono max-h-[120px] overflow-y-auto">
          {debugInfo.map((info, i) => (
            <div key={i}>{info}</div>
          ))}
        </div>
      )}
    </div>
  );
}
