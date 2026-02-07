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
  primaryColor: "#0f172a",
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
    <div className="border border-dashed border-slate-300 rounded-xl p-5 mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full bg-transparent border-none cursor-pointer p-0"
      >
        <h3 className="text-base font-bold text-slate-900 m-0">
          {title}
        </h3>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="mt-4">{children}</div>}
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
      <label className="block text-[0.8125rem] font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 border border-slate-300 rounded-md cursor-pointer p-0.5"
        />
        <input
          className="input-field flex-1 uppercase"
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
      <label className="block text-[0.8125rem] font-medium text-slate-700 mb-1.5">
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
      <label className="block text-[0.8125rem] font-medium text-slate-700 mb-1.5">
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
    <div className="flex rounded-lg overflow-hidden border border-slate-300 w-fit">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-5 py-2 text-sm font-medium border-none cursor-pointer transition-all ${
            value === opt.value
              ? "bg-slate-800 text-white"
              : "bg-white text-slate-700 hover:bg-slate-50"
          }`}
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
      if (mode === "speaking") return "#0f172a";
      return "#22c55e";
    }
    return "#22c55e";
  };

  return (
    <div
      className="relative w-full h-[500px] bg-slate-900 rounded-xl overflow-hidden"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {/* Popup widget */}
      {showPopup && (
        <div
          className="absolute bottom-20 right-4 shadow-2xl overflow-hidden"
          style={{
            width: config.variant === "compact" ? "280px" : "320px",
            backgroundColor: config.backgroundColor,
            borderRadius: `${config.borderRadius}px`,
            border: `1px solid ${config.borderColor}`,
          }}
        >
          {/* Header */}
          <div
            className="px-5 py-4 text-center"
            style={{ background: orbGradient }}
          >
            <div className="text-sm font-bold text-white tracking-wide uppercase">
              {displayName}
            </div>
            <div className="text-xs text-white/85 mt-0.5">
              {config.callToAction}
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            {/* Status */}
            <div
              className="bg-slate-50 rounded-lg p-3 text-center mb-3"
              style={{ border: `1px solid ${config.borderColor}` }}
            >
              <div
                className="text-[0.8125rem] font-medium"
                style={{ color: config.textColor }}
              >
                {getStatusText()}
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                {isConnected && mode === "speaking" ? (
                  <>
                    <Volume2 size={12} className="text-slate-900" />
                    <span className="text-xs text-slate-900 font-medium">
                      Agent parle...
                    </span>
                  </>
                ) : isConnected && mode === "listening" ? (
                  <>
                    <Mic size={12} className="text-emerald-500" />
                    <span className="text-xs text-emerald-500 font-medium">
                      En ecoute
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: getStatusColor(),
                        animation: connecting ? "pulse 1.5s infinite" : undefined,
                      }}
                    />
                    <span
                      className="text-xs font-medium"
                      style={{ color: getStatusColor() }}
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
                className="w-full py-3 border-none text-white text-sm font-semibold flex items-center justify-center gap-2"
                style={{
                  borderRadius: `${Math.min(config.borderRadius, 12)}px`,
                  background: connecting ? "#9ca3af" : orbGradient,
                  cursor: connecting || !elevenlabsAgentId ? "not-allowed" : "pointer",
                  opacity: !elevenlabsAgentId ? 0.5 : 1,
                }}
              >
                {connecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                className="w-full py-3 border-none text-white text-sm font-semibold cursor-pointer flex items-center justify-center gap-2"
                style={{
                  borderRadius: `${Math.min(config.borderRadius, 12)}px`,
                  background: config.activeButtonColor,
                }}
              >
                <PhoneOff size={16} />
                {config.endCallText}
              </button>
            )}
          </div>

          {/* Footer */}
          <div
            className="text-center py-2"
            style={{ borderTop: `1px solid ${config.borderColor}` }}
          >
            <span className="text-[0.625rem] text-slate-400">
              Propulse par{" "}
              <strong className="text-slate-500">{displayName}</strong>
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
        className="absolute bottom-4 right-4 w-14 h-14 flex items-center justify-center text-white cursor-pointer transition-transform hover:scale-105"
        style={{
          borderRadius: `${config.buttonRadius}%`,
          background: orbGradient,
          border: `3px solid ${config.borderColor}`,
          boxShadow: `0 0 20px rgba(0,0,0,0.2), 0 0 40px ${config.avatarColor2}33`,
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
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/widgets")}
            className="btn-ghost p-2"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 m-0">
              Configurateur de widgets
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {widgetName}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="btn-primary flex items-center gap-2"
          disabled={saving}
        >
          <Save size={16} />
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Left: Configuration */}
        <div>
          {/* Embed code */}
          <Section title="Code d'integration">
            <div className="relative bg-slate-100 rounded-lg p-4 font-mono text-[0.8125rem] leading-relaxed text-slate-700 break-all">
              <pre className="m-0 whitespace-pre-wrap">
                {embedCode}
              </pre>
              <button
                onClick={copyEmbed}
                className="absolute top-2 right-2 bg-white border border-slate-300 rounded-md p-1.5 cursor-pointer text-slate-500 hover:text-slate-900 transition-colors"
                title="Copier"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </Section>

          {/* Apparence */}
          <Section title="Apparence">
            <div className="mb-4">
              <label className="block text-[0.8125rem] font-medium text-slate-700 mb-1.5">
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

            <div className="grid grid-cols-2 gap-4 mb-4">
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

            <div className="grid grid-cols-2 gap-4">
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
            <div className="mb-4">
              <label className="block text-[0.8125rem] font-medium text-slate-700 mb-1.5">
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
              <div className="flex items-center gap-6">
                {/* Orb preview */}
                <div
                  className="w-20 h-20 rounded-full shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${config.avatarColor1}, ${config.avatarColor2})`,
                  }}
                />
                <div className="grid grid-cols-2 gap-4 flex-1">
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
            <div className="flex flex-col gap-4">
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
        <div className="sticky top-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">
            Apercu en direct
          </div>
          <WidgetPreview
            config={config}
            widgetName={widgetName}
            elevenlabsAgentId={elevenlabsAgentId}
          />
          {!elevenlabsAgentId && (
            <p className="text-xs text-amber-500 mt-2 text-center">
              Aucun agent associe — associez un agent pour tester l&apos;appel
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
