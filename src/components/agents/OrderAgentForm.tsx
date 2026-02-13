"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2, Upload, Link2, X, FileText, Globe, Play, Square,
  Phone, MessageSquare, Mail, ChevronLeft, ArrowRight, Info,
  Plus, Trash2, ShoppingCart,
} from "lucide-react";
import { SUPPORTED_LANGUAGES, LLM_MODELS, DEFAULT_FORM_VALUES } from "@/lib/constants";
import { listVoices, createOrderAgent, updateOrderAgent, uploadKnowledgeBase } from "@/lib/elevenlabs";
import { createClient } from "@/lib/supabase/client";
import type { Voice, CreateAgentFormData } from "@/types/elevenlabs";
import type { KnowledgeBaseItem, NotificationTemplate } from "@/types/database";

const CURRENCIES = [
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "Dollar US (USD)" },
  { code: "GBP", label: "Livre Sterling (GBP)" },
  { code: "MAD", label: "Dirham Marocain (MAD)" },
  { code: "TND", label: "Dinar Tunisien (TND)" },
  { code: "CAD", label: "Dollar Canadien (CAD)" },
  { code: "CHF", label: "Franc Suisse (CHF)" },
  { code: "XOF", label: "Franc CFA (XOF)" },
];

const TRANSFER_CONDITIONS = [
  { value: "demande_conseiller", label: "Si l'appelant demande a parler a un conseiller" },
  { value: "probleme_non_compris", label: "Si l'appelant mentionne un probleme non compris par le bot" },
  { value: "mot_cle_specifique", label: "Si l'appelant utilise un mot-cle specifique" },
  { value: "reponse_incomprise", label: "Si l'appelant ne comprend pas la reponse du bot" },
  { value: "demande_personne_reelle", label: "Si l'appelant demande une personne reelle" },
  { value: "duree_depassee", label: "Si l'appel dure plus de X minutes sans resolution" },
  { value: "etape_critique", label: "Si l'appel touche une etape critique (ex: paiement, litige)" },
];

const DAYS = [
  { key: "lun", label: "Lun" },
  { key: "mar", label: "Mar" },
  { key: "mer", label: "Mer" },
  { key: "jeu", label: "Jeu" },
  { key: "ven", label: "Ven" },
  { key: "sam", label: "Sam" },
  { key: "dim", label: "Dim" },
];

const TIMEZONES = [
  "Europe/Paris", "Europe/London", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Brussels", "America/New_York", "America/Chicago",
  "America/Los_Angeles", "Africa/Casablanca", "Africa/Tunis",
];

interface TransferConditionForm {
  id: string;
  name: string;
  phone: string;
  condition: string;
  instructions: string;
  time_restricted: boolean;
  timezone: string;
  time_from: string;
  time_to: string;
  active_days: string[];
}

function newTransferCondition(): TransferConditionForm {
  return {
    id: crypto.randomUUID(),
    name: "",
    phone: "",
    condition: "",
    instructions: "",
    time_restricted: false,
    timezone: "Europe/Paris",
    time_from: "09:00",
    time_to: "18:00",
    active_days: ["lun", "mar", "mer", "jeu", "ven"],
  };
}

interface Props {
  onCreated: () => void;
  onCancel: () => void;
  editMode?: boolean;
  agentId?: string;
  initialData?: Partial<CreateAgentFormData>;
}

export default function OrderAgentForm({ onCreated, onCancel, editMode, agentId, initialData }: Props) {
  // Basic info
  const [name, setName] = useState(initialData?.name || "");
  const [firstMessage, setFirstMessage] = useState(initialData?.firstMessage || "");
  const [systemPrompt, setSystemPrompt] = useState(initialData?.systemPrompt || "");
  const [voiceId, setVoiceId] = useState(initialData?.voiceId || "");
  const [language, setLanguage] = useState<string>(initialData?.language || DEFAULT_FORM_VALUES.language);
  const [llmModel, setLlmModel] = useState<string>(initialData?.llmModel || DEFAULT_FORM_VALUES.llmModel);
  const [temperature, setTemperature] = useState(initialData?.temperature ?? DEFAULT_FORM_VALUES.temperature);
  const [stability, setStability] = useState(initialData?.stability ?? DEFAULT_FORM_VALUES.stability);
  const [similarityBoost, setSimilarityBoost] = useState(initialData?.similarityBoost ?? DEFAULT_FORM_VALUES.similarityBoost);
  const [speed, setSpeed] = useState(initialData?.speed ?? DEFAULT_FORM_VALUES.speed);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState(initialData?.maxDurationSeconds ?? DEFAULT_FORM_VALUES.maxDurationSeconds);

  // Voices
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);

  // Voice preview
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Knowledge base
  const [kbFiles, setKbFiles] = useState<File[]>([]);
  const [kbUrl, setKbUrl] = useState("");
  const [kbUrls, setKbUrls] = useState<string[]>([]);
  const [existingKbItems, setExistingKbItems] = useState<KnowledgeBaseItem[]>([]);

  // Order settings
  const [currency, setCurrency] = useState("EUR");
  const [taxRate, setTaxRate] = useState(0);

  // Transfer
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [alwaysTransfer, setAlwaysTransfer] = useState(false);
  const [transferConditions, setTransferConditions] = useState<TransferConditionForm[]>([newTransferCondition()]);
  const [defaultTransferNumber, setDefaultTransferNumber] = useState("");

  // Notifications
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smsTemplateId, setSmsTemplateId] = useState<string>("");
  const [emailTemplateId, setEmailTemplateId] = useState<string>("");
  const [smsTemplates, setSmsTemplates] = useState<NotificationTemplate[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<NotificationTemplate[]>([]);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(!!editMode);

  // Load voices
  useEffect(() => {
    listVoices()
      .then((data) => {
        const voiceList = data.voices || [];
        setVoices(voiceList);
        if (!voiceId && !initialData?.voiceId && voiceList.length > 0) {
          setVoiceId(voiceList[0].voice_id);
        }
      })
      .catch(() => toast.error("Impossible de charger les voix"))
      .finally(() => setLoadingVoices(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load existing order config + KB items in edit mode
  useEffect(() => {
    if (!editMode || !agentId) return;
    const supabase = createClient();

    (async () => {
      try {
        const { data: agent } = await supabase
          .from("agents")
          .select("id")
          .eq("elevenlabs_agent_id", agentId)
          .single();

        if (!agent) return;

        const { data: config } = await supabase
          .from("agent_order_config")
          .select("*")
          .eq("agent_id", agent.id)
          .single();

        if (config) {
          setCurrency(config.currency || "EUR");
          setTaxRate(config.tax_rate ?? 0);
          setTransferEnabled(config.transfer_enabled ?? false);
          setAlwaysTransfer(config.always_transfer ?? false);
          setDefaultTransferNumber(config.default_transfer_number || "");
          setSmsEnabled(config.sms_enabled ?? false);
          setEmailEnabled(config.email_enabled ?? false);
          setSmsTemplateId(config.sms_template_id || "");
          setEmailTemplateId(config.email_template_id || "");

          const conditions = (config.transfer_conditions as TransferConditionForm[]) || [];
          if (conditions.length > 0) {
            setTransferConditions(conditions.map((c) => ({
              ...c,
              id: c.id || crypto.randomUUID(),
              active_days: c.active_days || ["lun", "mar", "mer", "jeu", "ven"],
            })));
          }
        }

        const { data: kbItems } = await supabase
          .from("knowledge_base_items")
          .select("*")
          .eq("elevenlabs_agent_id", agentId)
          .order("created_at", { ascending: false });

        if (kbItems) {
          setExistingKbItems(kbItems as KnowledgeBaseItem[]);
        }
      } catch {
        toast.error("Erreur chargement de la configuration");
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, [editMode, agentId]);

  // Load notification templates for order agent
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("notification_templates")
        .select("*")
        .eq("user_id", user.id)
        .eq("agent_type", "order")
        .order("name");
      if (data) {
        setSmsTemplates((data as NotificationTemplate[]).filter((t) => t.channel === "sms"));
        setEmailTemplates((data as NotificationTemplate[]).filter((t) => t.channel === "email"));
      }
    })();
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const toggleVoicePreview = useCallback(async () => {
    if (!voiceId) return;
    if (playingVoiceId && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoiceId(null);
      return;
    }
    const textToSpeak = firstMessage.trim() || "Bonjour, bienvenue ! Qu'est-ce que je peux vous servir aujourd'hui ?";
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setLoadingPreview(true);
    setPlayingVoiceId(voiceId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Non connecte"); return; }
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/text-to-speech`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ voice_id: voiceId, text: textToSpeak }),
        }
      );
      if (!res.ok) throw new Error("Erreur TTS");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingVoiceId(null); audioRef.current = null; URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlayingVoiceId(null); audioRef.current = null; URL.revokeObjectURL(url); };
      await audio.play();
    } catch {
      setPlayingVoiceId(null);
      audioRef.current = null;
      toast.error("Impossible de generer l'apercu vocal");
    } finally {
      setLoadingPreview(false);
    }
  }, [voiceId, firstMessage, playingVoiceId]);

  // KB file add
  const handleKbFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setKbFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const addKbUrl = () => {
    if (kbUrl.trim() && !kbUrls.includes(kbUrl.trim())) {
      setKbUrls((prev) => [...prev, kbUrl.trim()]);
      setKbUrl("");
    }
  };

  // Transfer condition helpers
  const updateCondition = (id: string, field: string, value: unknown) => {
    setTransferConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const removeCondition = (id: string) => {
    setTransferConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const addCondition = () => {
    setTransferConditions((prev) => [...prev, newTransferCondition()]);
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !voiceId) {
      toast.error("Le nom et la voix sont obligatoires");
      return;
    }
    setSubmitting(true);
    try {
      const orderConfig = {
        transfer_enabled: transferEnabled,
        always_transfer: alwaysTransfer,
        transfer_conditions: transferConditions.map((c) => ({
          name: c.name,
          phone: c.phone,
          condition: c.condition,
          instructions: c.instructions,
          time_restricted: c.time_restricted,
          timezone: c.timezone,
          time_from: c.time_from,
          time_to: c.time_to,
          active_days: c.active_days,
        })),
        default_transfer_number: defaultTransferNumber,
        sms_enabled: smsEnabled,
        email_enabled: emailEnabled,
        sms_template_id: smsTemplateId || null,
        email_template_id: emailTemplateId || null,
        currency,
        tax_rate: taxRate / 100, // Convert percentage to decimal
      };

      const formPayload = {
        name: name.trim(),
        firstMessage: firstMessage.trim(),
        systemPrompt: systemPrompt.trim(),
        voiceId,
        language,
        llmModel,
        temperature,
        stability,
        similarityBoost,
        speed,
        maxDurationSeconds,
        orderConfig,
      };

      let targetAgentId = agentId;

      if (editMode && agentId) {
        await updateOrderAgent(agentId, formPayload);
        targetAgentId = agentId;
      } else {
        const result = await createOrderAgent(formPayload);
        targetAgentId = result.agent_id;
      }

      // Upload new KB files
      if (targetAgentId) {
        for (const file of kbFiles) {
          try {
            await uploadKnowledgeBase(targetAgentId, file);
          } catch {
            toast.error(`Erreur upload: ${file.name}`);
          }
        }
        for (const url of kbUrls) {
          try {
            await uploadKnowledgeBase(targetAgentId, undefined, url);
          } catch {
            toast.error(`Erreur upload URL: ${url}`);
          }
        }
      }

      toast.success(editMode ? "Agent Commande mis a jour !" : "Agent Commande cree avec succes !");
      onCreated();
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors de la sauvegarde");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ========== Section 1: Basic Info ========== */}
      <div>
        <label className="label">Nom de l&apos;agent *</label>
        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent Commande Pizzeria" required />
      </div>

      <div>
        <label className="label">Message d&apos;accueil *</label>
        <textarea className="input-field min-h-[80px]" value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} placeholder="Bonjour, bienvenue ! Qu'est-ce que je peux vous servir aujourd'hui ?" />
        <p className="text-xs text-slate-400 mt-1">Premier message que l&apos;agent prononcera lors de l&apos;appel</p>
      </div>

      <div>
        <label className="label">Voix *</label>
        {loadingVoices ? (
          <div className="input-field flex items-center gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              className="input-field flex-1"
              value={voiceId}
              onChange={(e) => {
                if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; setPlayingVoiceId(null); }
                setVoiceId(e.target.value);
              }}
              required
            >
              <option value="">-- Selectionnez une voix --</option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>{v.name} ({v.category})</option>
              ))}
            </select>
            <button
              type="button"
              onClick={toggleVoicePreview}
              disabled={!voiceId || loadingPreview}
              className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${
                playingVoiceId === voiceId
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={playingVoiceId === voiceId ? "Arreter" : "Ecouter"}
            >
              {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : playingVoiceId === voiceId ? <Square size={14} /> : <Play size={14} />}
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="label">Prompt systeme (optionnel)</label>
        <textarea className="input-field min-h-[100px]" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Instructions supplementaires (ex: nom du restaurant, specialites, horaires d'ouverture, zones de livraison...)" />
        <p className="text-xs text-slate-400 mt-1">Ces instructions seront ajoutees au debut du prompt de l&apos;agent</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Langue</label>
          <select className="input-field" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Modele LLM</label>
          <select className="input-field" value={llmModel} onChange={(e) => setLlmModel(e.target.value)}>
            {LLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Temperature slider */}
      <div>
        <label className="label">
          Temperature : {temperature}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
          className="w-full accent-slate-900"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>Precis</span>
          <span>Creatif</span>
        </div>
      </div>

      {/* Parametres avances */}
      <details className="border border-slate-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-slate-700">
          Parametres avances de la voix
        </summary>
        <div className="px-4 pb-4 flex flex-col gap-4">
          <div>
            <label className="label">Stabilite : {stability}</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={stability}
              onChange={(e) => setStability(parseFloat(e.target.value))}
              className="w-full accent-slate-900"
            />
          </div>
          <div>
            <label className="label">Similarite : {similarityBoost}</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={similarityBoost}
              onChange={(e) => setSimilarityBoost(parseFloat(e.target.value))}
              className="w-full accent-slate-900"
            />
          </div>
          <div>
            <label className="label">Vitesse : {speed}</label>
            <input
              type="range" min="0.5" max="2" step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-slate-900"
            />
          </div>
          <div>
            <label className="label">Duree max (secondes)</label>
            <input
              type="number"
              className="input-field"
              value={maxDurationSeconds}
              onChange={(e) => setMaxDurationSeconds(parseInt(e.target.value))}
              min={60}
              max={3600}
            />
          </div>
        </div>
      </details>

      {/* ========== Section 2: Knowledge Base ========== */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-slate-600" />
          <h3 className="text-base font-semibold text-slate-900 m-0">Base de connaissances (Menu / Tarifs)</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">Importez votre menu, carte des prix ou catalogue. L&apos;agent les utilisera pour connaitre les produits et prix disponibles.</p>

        {/* Existing KB items (edit mode) */}
        {existingKbItems.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-slate-500 font-medium mb-2">Fichiers existants</p>
            {existingKbItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm text-slate-700 mb-2 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                {item.file_type === "url" ? <Globe size={14} className="text-green-600" /> : <FileText size={14} className="text-green-600" />}
                <span className="flex-1 truncate">{item.file_name}</span>
                <span className="text-green-600 text-xs font-medium">{item.status}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <label className="btn-secondary flex items-center gap-2 cursor-pointer text-sm">
            <Upload size={14} /> Ajouter un fichier
            <input type="file" className="hidden" accept=".pdf,.txt,.docx,.doc,.csv" multiple onChange={handleKbFileChange} />
          </label>
        </div>
        <p className="text-xs text-slate-400 mb-3">Formats acceptes: PDF, TXT, DOCX, DOC, CSV</p>

        {kbFiles.map((file, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-slate-700 mb-2 bg-slate-50 px-3 py-2 rounded-lg">
            <FileText size={14} />
            <span className="flex-1 truncate">{file.name}</span>
            <span className="text-slate-400 text-xs">{(file.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => setKbFiles((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
              <X size={14} />
            </button>
          </div>
        ))}

        <div className="flex gap-2 mt-3">
          <div className="flex items-center gap-2 flex-1">
            <Globe size={14} className="text-slate-400 shrink-0" />
            <input className="input-field flex-1" placeholder="https://example.com/menu" value={kbUrl} onChange={(e) => setKbUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKbUrl())} />
          </div>
          <button type="button" onClick={addKbUrl} className="btn-secondary text-sm" disabled={!kbUrl.trim()}>
            <Link2 size={14} />
          </button>
        </div>
        {kbUrls.map((url, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-slate-700 mt-2 bg-slate-50 px-3 py-2 rounded-lg">
            <Globe size={14} />
            <span className="flex-1 truncate">{url}</span>
            <button type="button" onClick={() => setKbUrls((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* ========== Section 3: Order Settings ========== */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={18} className="text-slate-600" />
          <h3 className="text-base font-semibold text-slate-900 m-0">Parametres de commande</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Devise</label>
            <select className="input-field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Taux de TVA (%)</label>
            <input
              type="number"
              className="input-field"
              value={taxRate}
              onChange={(e) => setTaxRate(Math.max(0, Math.min(100, Number(e.target.value))))}
              min={0}
              max={100}
              step={0.1}
              placeholder="0"
            />
            <p className="text-xs text-slate-400 mt-1">0 = pas de TVA</p>
          </div>
        </div>
      </div>

      {/* ========== Section 4: Transfer ========== */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Phone size={18} className="text-slate-600" />
            <h3 className="text-base font-semibold text-slate-900 m-0">Configuration du Transfert d&apos;Appel</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={transferEnabled} onChange={(e) => setTransferEnabled(e.target.checked)} />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900" />
          </label>
        </div>
        <p className="text-sm text-slate-500 mb-4">Configurez les conditions de transfert vers un conseiller humain</p>

        {transferEnabled && (
          <div className="space-y-4 pl-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-slate-900 w-4 h-4" checked={alwaysTransfer} onChange={(e) => setAlwaysTransfer(e.target.checked)} />
              <span className="text-sm text-slate-700">Toujours transferer les appels (sans condition)</span>
            </label>

            {!alwaysTransfer && (
              <>
                {transferConditions.map((cond, idx) => (
                  <div key={cond.id} className="border border-slate-200 rounded-xl p-4 relative">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-semibold text-slate-700">Condition de transfert {idx + 1}</span>
                      {transferConditions.length > 1 && (
                        <button type="button" onClick={() => removeCondition(cond.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="label">Nom du transfert</label>
                        <input className="input-field" value={cond.name} onChange={(e) => updateCondition(cond.id, "name", e.target.value)} placeholder="ex: Transfert vers manager" />
                      </div>

                      <div>
                        <label className="label">Numero de telephone (format international)</label>
                        <input className="input-field" type="tel" value={cond.phone} onChange={(e) => updateCondition(cond.id, "phone", e.target.value)} placeholder="+33612345678" />
                      </div>

                      <div>
                        <label className="label">Condition de transfert</label>
                        <select className="input-field" value={cond.condition} onChange={(e) => updateCondition(cond.id, "condition", e.target.value)}>
                          <option value="">Selectionner une condition...</option>
                          {TRANSFER_CONDITIONS.map((tc) => (
                            <option key={tc.value} value={tc.value}>{tc.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label">Consigne personnalisee (facultatif)</label>
                        <textarea className="input-field min-h-[70px]" value={cond.instructions} onChange={(e) => updateCondition(cond.id, "instructions", e.target.value)} placeholder="Ajoutez des instructions specifiques pour ce transfert..." />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="accent-slate-900 w-4 h-4" checked={cond.time_restricted} onChange={(e) => updateCondition(cond.id, "time_restricted", e.target.checked)} />
                        <span className="text-sm text-slate-700">Restreindre a une plage horaire</span>
                      </label>

                      {cond.time_restricted && (
                        <div className="pl-6 space-y-3 border-l-2 border-slate-200">
                          <div>
                            <label className="label">Fuseau horaire</label>
                            <select className="input-field" value={cond.timezone} onChange={(e) => updateCondition(cond.id, "timezone", e.target.value)}>
                              {TIMEZONES.map((tz) => (
                                <option key={tz} value={tz}>{tz}</option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="label">De</label>
                              <input type="time" className="input-field" value={cond.time_from} onChange={(e) => updateCondition(cond.id, "time_from", e.target.value)} />
                            </div>
                            <div>
                              <label className="label">A</label>
                              <input type="time" className="input-field" value={cond.time_to} onChange={(e) => updateCondition(cond.id, "time_to", e.target.value)} />
                            </div>
                          </div>

                          <div>
                            <label className="label">Jours actifs</label>
                            <div className="flex gap-2 flex-wrap">
                              {DAYS.map((d) => (
                                <button
                                  key={d.key}
                                  type="button"
                                  onClick={() => {
                                    const days = cond.active_days.includes(d.key)
                                      ? cond.active_days.filter((x) => x !== d.key)
                                      : [...cond.active_days, d.key];
                                    updateCondition(cond.id, "active_days", days);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    cond.active_days.includes(d.key)
                                      ? "bg-slate-900 text-white"
                                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                  }`}
                                >
                                  {d.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addCondition} className="btn-secondary text-sm flex items-center gap-1 w-full justify-center py-2.5">
                  <Plus size={14} /> Ajouter une condition de transfert
                </button>
              </>
            )}

            <div>
              <label className="label">Numero de transfert par defaut (optionnel)</label>
              <input className="input-field" type="tel" value={defaultTransferNumber} onChange={(e) => setDefaultTransferNumber(e.target.value)} placeholder="+33612345678" />
              <p className="text-xs text-slate-400 mt-1">Utilise si aucune condition ne correspond</p>
            </div>
          </div>
        )}
      </div>

      {/* ========== Section 5: SMS Notifications ========== */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-slate-600" />
            <h3 className="text-base font-semibold text-slate-900 m-0">Facture par SMS</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900" />
          </label>
        </div>
        <p className="text-sm text-slate-500 mb-4">Envoyer automatiquement la facture par SMS apres chaque commande validee</p>

        {smsEnabled && (
          <div className="space-y-3">
            <div>
              <label className="label">Template SMS</label>
              <select className="input-field" value={smsTemplateId} onChange={(e) => setSmsTemplateId(e.target.value)}>
                <option value="">Template par defaut</option>
                {smsTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Gerez vos templates dans Notifications &gt; Templates</p>
            </div>
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
              <Info size={18} className="shrink-0 mt-0.5" />
              <p className="m-0">
                Les SMS seront envoyes via Twilio. Assurez-vous que votre compte Twilio est configure et que vous avez suffisamment de credits.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ========== Section 6: Email Notifications ========== */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-slate-600" />
            <h3 className="text-base font-semibold text-slate-900 m-0">Facture par Email</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900" />
          </label>
        </div>
        <p className="text-sm text-slate-500 mb-4">Envoyer automatiquement la facture detaillee par email apres chaque commande validee</p>

        {emailEnabled && (
          <div className="space-y-3">
            <div>
              <label className="label">Template Email</label>
              <select className="input-field" value={emailTemplateId} onChange={(e) => setEmailTemplateId(e.target.value)}>
                <option value="">Template par defaut</option>
                {emailTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Gerez vos templates dans Notifications &gt; Templates</p>
            </div>
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
              <Info size={18} className="shrink-0 mt-0.5" />
              <p className="m-0">
                Les emails seront envoyes via votre integration configuree (Google/Microsoft ou Resend en fallback).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ========== Footer ========== */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <button type="button" onClick={onCancel} className="btn-secondary flex items-center gap-2">
          <ChevronLeft size={16} /> Annuler
        </button>
        <button type="submit" disabled={submitting} className="btn-primary flex items-center gap-2">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting
            ? (editMode ? "Mise a jour..." : "Creation en cours...")
            : (editMode ? "Mettre a jour" : "Creer l'agent")}
          {!submitting && <ArrowRight size={16} />}
        </button>
      </div>
    </form>
  );
}
