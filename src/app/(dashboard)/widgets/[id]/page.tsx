"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useConversation } from "@elevenlabs/react";
import {
  ArrowLeft,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  Save,
  Phone,
  PhoneOff,
  X,
  Volume2,
  Mic,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/elevenlabs";
import type { Widget, WidgetConfig } from "@/types/database";

const DEFAULT_CONFIG: WidgetConfig = {
  position: "bottom-right",
  primaryColor: "#F97316",
  greeting: "Bonjour ! Comment puis-je vous aider ?",
  width: 380,
  height: 600,
  variant: "full",
  backgroundColor: "#FFFFFF",
  textColor: "#000000",
  borderColor: "#E2E8F0",
  focusColor: "#3B82F6",
  activeButtonColor: "#f44336",
  buttonFocusColor: "#3B82F6",
  borderRadius: 16,
  buttonRadius: 50,
  avatarType: "orb",
  avatarColor1: "#4f524c",
  avatarColor2: "#F5CABB",
  avatarImageUrl: "",
  startCallText: "Demarrer un appel",
  endCallText: "Fin",
  callToAction: "Besoin d'aide?",
  listeningText: "Ecoute",
  speakingText: "Parler pour interrompre",
};

// ===================== COLLAPSIBLE SECTION =====================
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "1px dashed #d1d5db",
        borderRadius: "0.75rem",
        padding: "1.25rem",
        marginBottom: "1rem",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <h3
          style={{
            fontSize: "1rem",
            fontWeight: 700,
            color: "#111827",
            margin: 0,
          }}
        >
          {title}
        </h3>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div style={{ marginTop: "1rem" }}>{children}</div>}
    </div>
  );
}

// ===================== COLOR INPUT =====================
function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "#374151",
          marginBottom: "0.375rem",
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "2.5rem",
            height: "2.25rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            cursor: "pointer",
            padding: "2px",
          }}
        />
        <input
          className="input-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, textTransform: "uppercase" }}
        />
      </div>
    </div>
  );
}

// ===================== NUMBER INPUT =====================
function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "#374151",
          marginBottom: "0.375rem",
        }}
      >
        {label}
      </label>
      <input
        className="input-field"
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
      />
    </div>
  );
}

// ===================== TEXT INPUT =====================
function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "#374151",
          marginBottom: "0.375rem",
        }}
      >
        {label}
      </label>
      <input
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ===================== TOGGLE BUTTON GROUP =====================
function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0",
        borderRadius: "0.5rem",
        overflow: "hidden",
        border: "1px solid #d1d5db",
        width: "fit-content",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "0.5rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            backgroundColor:
              value === opt.value ? "#1e293b" : "#fff",
            color: value === opt.value ? "#fff" : "#374151",
            transition: "all 0.15s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ===================== LIVE PREVIEW WITH REAL CALL =====================
function WidgetPreview({
  config,
  widgetName,
  elevenlabsAgentId,
}: {
  config: WidgetConfig;
  widgetName: string;
  elevenlabsAgentId: string;
}) {
  const [showPopup, setShowPopup] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [mode, setMode] = useState<string>("idle");

  const conversation = useConversation({
    onConnect: () => {
      setIsConnected(true);
      setConnecting(false);
    },
    onDisconnect: () => {
      setIsConnected(false);
      setConnecting(false);
      setMode("idle");
    },
    onMessage: () => {},
    onError: (message: string) => {
      toast.error(`Erreur: ${message}`);
      setConnecting(false);
    },
    onModeChange: ({ mode: newMode }: { mode: string }) => {
      setMode(newMode);
    },
  });

  const handleStartCall = useCallback(async () => {
    if (!elevenlabsAgentId) {
      toast.error("Aucun agent associe a ce widget");
      return;
    }
    setConnecting(true);
    try {
      const data = await getSignedUrl(elevenlabsAgentId);
      if (data.signed_url) {
        await conversation.startSession({ signedUrl: data.signed_url });
        return;
      }
    } catch {
      // Fallback to direct connection
    }
    try {
      await conversation.startSession({
        agentId: elevenlabsAgentId,
        connectionType: "websocket",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erreur: ${msg}`);
      setConnecting(false);
    }
  }, [elevenlabsAgentId, conversation]);

  const handleEndCall = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const orbGradient = `linear-gradient(135deg, ${config.avatarColor1}, ${config.avatarColor2})`;
  const displayName = widgetName || "Widget";

  // Status text based on call state
  const getStatusText = () => {
    if (connecting) return "Connexion...";
    if (isConnected) {
      if (mode === "listening") return config.listeningText;
      if (mode === "speaking") return config.speakingText;
      return "Connecte";
    }
    return "Pret a vous aider";
  };

  const getStatusColor = () => {
    if (isConnected) {
      if (mode === "speaking") return "#EA580C";
      return "#22c55e";
    }
    return "#22c55e";
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "500px",
        backgroundColor: "#0f172a",
        borderRadius: "0.75rem",
        overflow: "hidden",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* Popup widget */}
      {showPopup && (
        <div
          style={{
            position: "absolute",
            bottom: "5rem",
            right: "1rem",
            width: config.variant === "compact" ? "280px" : "320px",
            backgroundColor: config.backgroundColor,
            borderRadius: `${config.borderRadius}px`,
            border: `1px solid ${config.borderColor}`,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: orbGradient,
              padding: "1rem 1.25rem",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "rgba(255,255,255,0.85)",
                marginTop: "0.125rem",
              }}
            >
              {config.callToAction}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "1rem 1.25rem" }}>
            {/* Status */}
            <div
              style={{
                backgroundColor: "#f8fafc",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                textAlign: "center",
                marginBottom: "0.75rem",
                border: `1px solid ${config.borderColor}`,
              }}
            >
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: config.textColor,
                  fontWeight: 500,
                }}
              >
                {getStatusText()}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.375rem",
                  marginTop: "0.25rem",
                }}
              >
                {isConnected && mode === "speaking" ? (
                  <>
                    <Volume2 size={12} style={{ color: "#EA580C" }} />
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#EA580C",
                        fontWeight: 500,
                      }}
                    >
                      Agent parle...
                    </span>
                  </>
                ) : isConnected && mode === "listening" ? (
                  <>
                    <Mic size={12} style={{ color: "#22c55e" }} />
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#22c55e",
                        fontWeight: 500,
                      }}
                    >
                      En ecoute
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: getStatusColor(),
                        animation: connecting
                          ? "pulse 1.5s infinite"
                          : undefined,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: getStatusColor(),
                        fontWeight: 500,
                      }}
                    >
                      {connecting ? "Connexion..." : isConnected ? "Connecte" : "En ligne"}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Call button */}
            {!isConnected ? (
              <button
                onClick={handleStartCall}
                disabled={connecting || !elevenlabsAgentId}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: `${Math.min(config.borderRadius, 12)}px`,
                  border: "none",
                  background: connecting
                    ? "#9ca3af"
                    : orbGradient,
                  color: "#fff",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor:
                    connecting || !elevenlabsAgentId
                      ? "not-allowed"
                      : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  opacity: !elevenlabsAgentId ? 0.5 : 1,
                }}
              >
                {connecting ? (
                  <>
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    Connexion...
                  </>
                ) : (
                  <>
                    <Phone size={16} />
                    {config.startCallText}
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleEndCall}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: `${Math.min(config.borderRadius, 12)}px`,
                  border: "none",
                  background: config.activeButtonColor,
                  color: "#fff",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <PhoneOff size={16} />
                {config.endCallText}
              </button>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              textAlign: "center",
              padding: "0.5rem",
              borderTop: `1px solid ${config.borderColor}`,
            }}
          >
            <span
              style={{
                fontSize: "0.625rem",
                color: "#9ca3af",
              }}
            >
              Propulse par{" "}
              <strong style={{ color: "#6b7280" }}>{displayName}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Floating orb button */}
      <button
        onClick={() => {
          if (isConnected) {
            handleEndCall();
          }
          setShowPopup(!showPopup);
        }}
        style={{
          position: "absolute",
          bottom: "1rem",
          right: "1rem",
          width: "56px",
          height: "56px",
          borderRadius: `${config.buttonRadius}%`,
          background: orbGradient,
          border: `3px solid ${config.borderColor}`,
          boxShadow: `0 0 20px rgba(0,0,0,0.2), 0 0 40px ${config.avatarColor2}33`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          transition: "transform 0.2s",
        }}
      >
        {showPopup ? <X size={22} /> : <Phone size={22} />}
      </button>
    </div>
  );
}

// ===================== MAIN PAGE =====================
export default function WidgetConfiguratorPage() {
  const params = useParams();
  const router = useRouter();
  const widgetId = params.id as string;

  const [widget, setWidget] = useState<Widget | null>(null);
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [widgetName, setWidgetName] = useState<string>("");
  const [elevenlabsAgentId, setElevenlabsAgentId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchWidget = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("widgets")
        .select("*, agent:agents(name, elevenlabs_agent_id)")
        .eq("id", widgetId)
        .single();
      if (error) throw error;
      setWidget(data as Widget);
      setWidgetName((data as Widget).name);
      setConfig({ ...DEFAULT_CONFIG, ...((data as Widget).config || {}) });
      const agent = (data as Record<string, unknown>).agent as {
        name: string;
        elevenlabs_agent_id: string;
      } | null;
      if (agent) {
        setElevenlabsAgentId(agent.elevenlabs_agent_id);
      }
    } catch {
      toast.error("Widget introuvable");
      router.push("/widgets");
    } finally {
      setLoading(false);
    }
  }, [widgetId, router]);

  useEffect(() => {
    fetchWidget();
  }, [fetchWidget]);

  const handleSave = async () => {
    if (!widget) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("widgets")
        .update({ config })
        .eq("id", widget.id);
      if (error) throw error;
      toast.success("Configuration sauvegardee");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: keyof WidgetConfig, value: string | number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";

  const embedCode = elevenlabsAgentId
    ? `<hallcall agent-id="${elevenlabsAgentId}"></hallcall>\n<script src="${appUrl}/api/widgets/script/${elevenlabsAgentId}"></script>`
    : `<hallcall agent-id="VOTRE_AGENT_ID"></hallcall>\n<script src="${appUrl}/api/widgets/script/VOTRE_AGENT_ID"></script>`;

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast.success("Code copie !");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "5rem 0",
        }}
      >
        <div
          style={{
            width: "2rem",
            height: "2rem",
            border: "4px solid #FFEDD5",
            borderTopColor: "#F97316",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            onClick={() => router.push("/widgets")}
            className="btn-ghost"
            style={{ padding: "0.5rem" }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#111827",
                margin: 0,
              }}
            >
              Configurateur de widgets
            </h1>
            <p
              style={{
                color: "#6b7280",
                marginTop: "0.125rem",
                fontSize: "0.875rem",
              }}
            >
              {widgetName}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="btn-primary"
          disabled={saving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Save size={16} />
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </div>

      {/* Two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left: Configuration */}
        <div>
          {/* Embed code */}
          <Section title="Code d'integration">
            <div
              style={{
                position: "relative",
                backgroundColor: "#f1f5f9",
                borderRadius: "0.5rem",
                padding: "1rem",
                fontFamily: "monospace",
                fontSize: "0.8125rem",
                lineHeight: 1.6,
                color: "#334155",
                wordBreak: "break-all",
              }}
            >
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {embedCode}
              </pre>
              <button
                onClick={copyEmbed}
                style={{
                  position: "absolute",
                  top: "0.5rem",
                  right: "0.5rem",
                  background: "white",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  padding: "0.375rem",
                  cursor: "pointer",
                  color: "#6b7280",
                }}
                title="Copier"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </Section>

          {/* Apparence */}
          <Section title="Apparence">
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: "#374151",
                  marginBottom: "0.375rem",
                }}
              >
                Variante
              </label>
              <ToggleGroup
                options={[
                  { label: "Compact", value: "compact" },
                  { label: "Plein", value: "full" },
                ]}
                value={config.variant}
                onChange={(v) => updateConfig("variant", v)}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <ColorInput
                label="Couleur d'arriere-plan"
                value={config.backgroundColor}
                onChange={(v) => updateConfig("backgroundColor", v)}
              />
              <ColorInput
                label="Couleur du texte"
                value={config.textColor}
                onChange={(v) => updateConfig("textColor", v)}
              />
              <ColorInput
                label="Couleur de la bordure"
                value={config.borderColor}
                onChange={(v) => updateConfig("borderColor", v)}
              />
              <ColorInput
                label="Couleur de mise au point"
                value={config.focusColor}
                onChange={(v) => updateConfig("focusColor", v)}
              />
              <ColorInput
                label="Couleur active du bouton"
                value={config.activeButtonColor}
                onChange={(v) => updateConfig("activeButtonColor", v)}
              />
              <ColorInput
                label="Couleur de mise au point du bouton"
                value={config.buttonFocusColor}
                onChange={(v) => updateConfig("buttonFocusColor", v)}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <NumberInput
                label="Rayon de la bordure"
                value={config.borderRadius}
                onChange={(v) => updateConfig("borderRadius", v)}
                min={0}
                max={50}
              />
              <NumberInput
                label="Rayon du bouton"
                value={config.buttonRadius}
                onChange={(v) => updateConfig("buttonRadius", v)}
                min={0}
                max={50}
              />
            </div>
          </Section>

          {/* Avatar */}
          <Section title="Avatar">
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: "#374151",
                  marginBottom: "0.375rem",
                }}
              >
                Type d&apos;avatar
              </label>
              <ToggleGroup
                options={[
                  { label: "Orb", value: "orb" },
                  { label: "Link", value: "link" },
                  { label: "Image", value: "image" },
                ]}
                value={config.avatarType}
                onChange={(v) => updateConfig("avatarType", v)}
              />
            </div>

            {config.avatarType === "orb" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.5rem",
                }}
              >
                {/* Orb preview */}
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${config.avatarColor1}, ${config.avatarColor2})`,
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    flex: 1,
                  }}
                >
                  <ColorInput
                    label="Premiere couleur"
                    value={config.avatarColor1}
                    onChange={(v) => updateConfig("avatarColor1", v)}
                  />
                  <ColorInput
                    label="Deuxieme couleur"
                    value={config.avatarColor2}
                    onChange={(v) => updateConfig("avatarColor2", v)}
                  />
                </div>
              </div>
            )}

            {config.avatarType === "image" && (
              <TextInput
                label="URL de l'image"
                value={config.avatarImageUrl}
                onChange={(v) => updateConfig("avatarImageUrl", v)}
              />
            )}
          </Section>

          {/* Contenu du texte */}
          <Section title="Contenu du texte">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <TextInput
                label="Bouton de demarrage de l'appel"
                value={config.startCallText}
                onChange={(v) => updateConfig("startCallText", v)}
              />
              <TextInput
                label="Bouton de fin d'appel"
                value={config.endCallText}
                onChange={(v) => updateConfig("endCallText", v)}
              />
              <TextInput
                label="Appel a l'action"
                value={config.callToAction}
                onChange={(v) => updateConfig("callToAction", v)}
              />
              <TextInput
                label="Statut d'ecoute"
                value={config.listeningText}
                onChange={(v) => updateConfig("listeningText", v)}
              />
              <TextInput
                label="Statut de la parole"
                value={config.speakingText}
                onChange={(v) => updateConfig("speakingText", v)}
              />
            </div>
          </Section>
        </div>

        {/* Right: Live Preview */}
        <div style={{ position: "sticky", top: "1rem" }}>
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#374151",
              marginBottom: "0.75rem",
            }}
          >
            Apercu en direct
          </div>
          <WidgetPreview
            config={config}
            widgetName={widgetName}
            elevenlabsAgentId={elevenlabsAgentId}
          />
          {!elevenlabsAgentId && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#f59e0b",
                marginTop: "0.5rem",
                textAlign: "center",
              }}
            >
              Aucun agent associe — associez un agent pour tester l&apos;appel
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
