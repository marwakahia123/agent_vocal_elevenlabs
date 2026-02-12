"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useConversation } from "@elevenlabs/react";

const DEFAULT_CONFIG = {
  position: "bottom-right" as const,
  backgroundColor: "#FFFFFF",
  textColor: "#000000",
  borderColor: "#E2E8F0",
  avatarColor1: "#4f524c",
  avatarColor2: "#F5CABB",
  activeButtonColor: "#f44336",
  borderRadius: 16,
  startCallText: "Demarrer un appel",
  endCallText: "Fin",
  callToAction: "Besoin d'aide ?",
  listeningText: "Ecoute...",
  speakingText: "Parler pour interrompre",
};

interface TranscriptEntry {
  role: "user" | "agent";
  message: string;
}

export default function WidgetPage() {
  const { agentId } = useParams<{ agentId: string }>();

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [widgetName, setWidgetName] = useState("Assistant");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [mode, setMode] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch widget config
  useEffect(() => {
    fetch(`/api/widgets/config/${agentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.config) setConfig({ ...DEFAULT_CONFIG, ...d.config });
        if (d?.name) setWidgetName(d.name);
      })
      .catch(() => {});
  }, [agentId]);

  const conversation = useConversation({
    onConnect: () => {
      setIsConnected(true);
      setConnecting(false);
      setError(null);
    },
    onDisconnect: () => {
      setIsConnected(false);
      setMode("idle");
    },
    onMessage: ({ message, role }: { message: string; role: string }) => {
      setTranscript((prev) => [
        ...prev,
        { role: role as "user" | "agent", message },
      ]);
    },
    onError: (message: string) => {
      setError(message);
      setConnecting(false);
    },
    onModeChange: ({ mode: m }: { mode: string }) => {
      setMode(m);
    },
  });

  // Auto-scroll transcript
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleStart = useCallback(async () => {
    setConnecting(true);
    setTranscript([]);
    setError(null);
    try {
      const res = await fetch(`/api/widgets/signed-url/${agentId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get signed URL");
      }
      const data = await res.json();
      await conversation.startSession({ signedUrl: data.signed_url });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConnecting(false);
    }
  }, [agentId, conversation]);

  const handleEnd = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const grad = `linear-gradient(135deg, ${config.avatarColor1}, ${config.avatarColor2})`;
  const radius = Math.min(config.borderRadius, 12);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        backgroundColor: config.backgroundColor,
        color: config.textColor,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          background: grad,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "white",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {widgetName}
        </div>
        <div
          style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 }}
        >
          {config.callToAction}
        </div>
      </div>

      {/* Transcript */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {transcript.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#94a3b8",
              fontSize: 13,
              paddingTop: 40,
            }}
          >
            {isConnected
              ? "En attente... Parlez !"
              : "Cliquez sur le bouton pour commencer"}
          </div>
        ) : (
          transcript.map((entry, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent:
                  entry.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  padding: "8px 12px",
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.4,
                  ...(entry.role === "user"
                    ? {
                        backgroundColor: config.avatarColor1,
                        color: "white",
                        borderBottomRightRadius: 4,
                      }
                    : {
                        backgroundColor: "#f1f5f9",
                        color: config.textColor,
                        borderBottomLeftRadius: 4,
                      }),
                }}
              >
                {entry.message}
              </div>
            </div>
          ))
        )}
        <div ref={scrollRef} />
      </div>

      {/* Status bar */}
      {isConnected && (
        <div
          style={{
            padding: "8px 16px",
            textAlign: "center",
            fontSize: 12,
            color:
              mode === "listening"
                ? "#22c55e"
                : mode === "speaking"
                  ? "#0f172a"
                  : "#94a3b8",
            borderTop: `1px solid ${config.borderColor}`,
          }}
        >
          {mode === "listening"
            ? config.listeningText
            : mode === "speaking"
              ? config.speakingText
              : "Connecte"}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "8px 16px",
            fontSize: 12,
            color: "#dc2626",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {/* Call button */}
      <div
        style={{
          padding: "12px 16px 16px",
          flexShrink: 0,
          borderTop: `1px solid ${config.borderColor}`,
        }}
      >
        {!isConnected ? (
          <button
            onClick={handleStart}
            disabled={connecting}
            style={{
              width: "100%",
              padding: "12px",
              border: "none",
              borderRadius: radius,
              background: connecting ? "#9ca3af" : grad,
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: connecting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {connecting ? "Connexion..." : config.startCallText}
          </button>
        ) : (
          <button
            onClick={handleEnd}
            style={{
              width: "100%",
              padding: "12px",
              border: "none",
              borderRadius: radius,
              background: config.activeButtonColor,
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {config.endCallText}
          </button>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          textAlign: "center",
          padding: 6,
          fontSize: 10,
          color: "#94a3b8",
          borderTop: `1px solid ${config.borderColor}`,
        }}
      >
        Propulse par <strong style={{ color: "#64748b" }}>HallCall</strong>
      </div>
    </div>
  );
}
