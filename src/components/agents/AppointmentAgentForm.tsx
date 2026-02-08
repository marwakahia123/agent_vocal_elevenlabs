"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2, Upload, Link2, X, FileText, Globe, Play, Square,
  Phone, Clock, Calendar, MessageSquare, Mail, ChevronLeft,
  ArrowRight, Plus, Trash2, Info,
} from "lucide-react";
import { SUPPORTED_LANGUAGES, LLM_MODELS, DEFAULT_FORM_VALUES } from "@/lib/constants";
import { listVoices, createRdvAgent, updateRdvAgent, uploadKnowledgeBase } from "@/lib/elevenlabs";
import { createClient } from "@/lib/supabase/client";
import type { Voice, CreateAgentFormData } from "@/types/elevenlabs";
import type { KnowledgeBaseItem } from "@/types/database";

interface Props {
  onCreated: () => void;
  onCancel: () => void;
  editMode?: boolean;
  agentId?: string;
  initialData?: Partial<CreateAgentFormData>;
}

const TRANSFER_CONDITIONS = [
  { value: "demande_conseiller", label: "Si l'appelant demande a parler a un conseiller" },
  { value: "probleme_non_compris", label: "Si l'appelant mentionne un probleme non compris par le bot" },
  { value: "mot_cle_specifique", label: "Si l'appelant utilise un mot-cle specifique" },
  { value: "reponse_incomprise", label: "Si l'appelant ne comprend pas la reponse du bot" },
  { value: "demande_personne_reelle", label: "Si l'appelant demande une personne reelle" },
  { value: "duree_depassee", label: "Si l'appel dure plus de X minutes sans resolution" },
  { value: "etape_critique", label: "Si l'appel touche une etape critique (ex: paiement, litige)" },
];

const SLOT_DURATIONS = [10, 15, 20, 30, 45, 60];

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
  "Europe/Paris",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Brussels",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Africa/Casablanca",
  "Africa/Tunis",
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

export default function AppointmentAgentForm({ onCreated, onCancel, editMode, agentId, initialData }: Props) {
  // Basic info
  const [name, setName] = useState(initialData?.name || "");
  const [firstMessage, setFirstMessage] = useState(initialData?.firstMessage || "");
  const [systemPrompt, setSystemPrompt] = useState(initialData?.systemPrompt || "");
  const [voiceId, setVoiceId] = useState(initialData?.voiceId || "");
  const [language, setLanguage] = useState<string>(initialData?.language || DEFAULT_FORM_VALUES.language);
  const [llmModel, setLlmModel] = useState<string>(initialData?.llmModel || DEFAULT_FORM_VALUES.llmModel);

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

  // Availability
  const [availabilityEnabled, setAvailabilityEnabled] = useState(true);
  const [workingDays, setWorkingDays] = useState(["lun", "mar", "mer", "jeu", "ven"]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState(20);
  const [breaks, setBreaks] = useState<{ start: string; end: string }[]>([{ start: "12:00", end: "14:00" }]);
  const [minDelay, setMinDelay] = useState(2);
  const [maxHorizon, setMaxHorizon] = useState(30);

  // Transfer
  const [transferEnabled, setTransferEnabled] = useState(false);
  const [alwaysTransfer, setAlwaysTransfer] = useState(false);
  const [transferConditions, setTransferConditions] = useState<TransferConditionForm[]>([newTransferCondition()]);
  const [defaultTransferNumber, setDefaultTransferNumber] = useState("");

  // Notifications
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);

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

  // Load existing RDV config + KB items in edit mode
  useEffect(() => {
    if (!editMode || !agentId) return;
    const supabase = createClient();

    (async () => {
      try {
        // Find agent record by elevenlabs_agent_id
        const { data: agent } = await supabase
          .from("agents")
          .select("id")
          .eq("elevenlabs_agent_id", agentId)
          .single();

        if (!agent) return;

        // Load RDV config
        const { data: config } = await supabase
          .from("agent_rdv_config")
          .select("*")
          .eq("agent_id", agent.id)
          .single();

        if (config) {
          setAvailabilityEnabled(config.availability_enabled ?? true);
          setWorkingDays(config.working_days || ["lun", "mar", "mer", "jeu", "ven"]);
          setStartTime(config.start_time || "09:00");
          setEndTime(config.end_time || "17:00");
          setSlotDuration(config.slot_duration_minutes || 20);
          setBreaks(config.breaks || [{ start: "12:00", end: "14:00" }]);
          setMinDelay(config.min_delay_hours ?? 2);
          setMaxHorizon(config.max_horizon_days ?? 30);
          setTransferEnabled(config.transfer_enabled ?? false);
          setAlwaysTransfer(config.always_transfer ?? false);
          setDefaultTransferNumber(config.default_transfer_number || "");
          setSmsEnabled(config.sms_notification_enabled ?? false);
          setEmailEnabled(config.email_notification_enabled ?? false);

          // Load transfer conditions
          const conditions = (config.transfer_conditions as TransferConditionForm[]) || [];
          if (conditions.length > 0) {
            setTransferConditions(conditions.map((c) => ({
              ...c,
              id: c.id || crypto.randomUUID(),
              active_days: c.active_days || ["lun", "mar", "mer", "jeu", "ven"],
            })));
          }
        }

        // Load existing KB items
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
    const textToSpeak = firstMessage.trim() || "Bonjour, comment puis-je vous aider ?";
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

  // Toggle day
  const toggleDay = (day: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(day) ? list.filter((d) => d !== day) : [...list, day]);
  };

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

  // Break helpers
  const addBreak = () => setBreaks((prev) => [...prev, { start: "12:00", end: "13:00" }]);
  const removeBreak = (index: number) => setBreaks((prev) => prev.filter((_, i) => i !== index));
  const updateBreak = (index: number, field: "start" | "end", value: string) => {
    setBreaks((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)));
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !voiceId) {
      toast.error("Le nom et la voix sont obligatoires");
      return;
    }
    if (availabilityEnabled && endTime <= startTime) {
      toast.error("L'heure de fin doit etre apres l'heure de debut (format 24h, ex: 17:00 pour 5 PM)");
      return;
    }
    if (availabilityEnabled && workingDays.length === 0) {
      toast.error("Selectionnez au moins un jour de travail");
      return;
    }
    setSubmitting(true);
    try {
      const rdvConfig = {
        availability_enabled: availabilityEnabled,
        working_days: workingDays,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: slotDuration,
        breaks,
        min_delay_hours: minDelay,
        max_horizon_days: maxHorizon,
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
        sms_notification_enabled: smsEnabled,
        email_notification_enabled: emailEnabled,
      };

      const formPayload = {
        name: name.trim(),
        firstMessage: firstMessage.trim(),
        systemPrompt: systemPrompt.trim(),
        voiceId,
        language,
        llmModel,
        temperature: DEFAULT_FORM_VALUES.temperature,
        stability: DEFAULT_FORM_VALUES.stability,
        similarityBoost: DEFAULT_FORM_VALUES.similarityBoost,
        speed: DEFAULT_FORM_VALUES.speed,
        maxDurationSeconds: DEFAULT_FORM_VALUES.maxDurationSeconds,
        rdvConfig,
      };

      let targetAgentId = agentId;

      if (editMode && agentId) {
        await updateRdvAgent(agentId, formPayload);
        targetAgentId = agentId;
      } else {
        const result = await createRdvAgent(formPayload);
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

      toast.success(editMode ? "Agent de prise de rendez-vous mis a jour !" : "Agent de prise de rendez-vous cree !");
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
        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent Prise de Rendez-vous" required />
      </div>

      <div>
        <label className="label">Message d&apos;accueil *</label>
        <textarea className="input-field min-h-[80px]" value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} placeholder="Bonjour, je suis votre assistant pour la prise de rendez-vous..." />
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
        <textarea className="input-field min-h-[100px]" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Instructions supplementaires pour ameliorer le comportement de l'agent..." />
        <p className="text-xs text-slate-400 mt-1">Ajoutez des instructions personnalisees pour affiner le comportement de l&apos;agent</p>
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

      {/* ========== Section 2: Knowledge Base ========== */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-slate-600" />
          <h3 className="text-base font-semibold text-slate-900 m-0">Base de connaissances</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">Documents que l&apos;agent utilisera pour repondre aux questions</p>

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
            <input className="input-field flex-1" placeholder="https://example.com/documentation" value={kbUrl} onChange={(e) => setKbUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKbUrl())} />
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

      {/* ========== Section 3: Availability ========== */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-slate-600" />
            <h3 className="text-base font-semibold text-slate-900 m-0">Horaires de Disponibilite</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={availabilityEnabled} onChange={(e) => setAvailabilityEnabled(e.target.checked)} />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900" />
          </label>
        </div>
        <p className="text-sm text-slate-500 mb-4">Definir des creneaux de disponibilite fixes pour la prise de rendez-vous</p>

        {availabilityEnabled && (
          <div className="space-y-4 pl-1">
            {/* Working days */}
            <div>
              <label className="label">Jours de travail</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key, workingDays, setWorkingDays)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      workingDays.includes(d.key)
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Heure de debut</label>
                <input type="time" className="input-field" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                <p className="text-xs text-slate-400 mt-1">Format 24h (ex: 09:00)</p>
              </div>
              <div>
                <label className="label">Heure de fin</label>
                <input type="time" className={`input-field ${endTime && startTime && endTime <= startTime ? "border-red-400" : ""}`} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                <p className={`text-xs mt-1 ${endTime && startTime && endTime <= startTime ? "text-red-500 font-medium" : "text-slate-400"}`}>
                  {endTime && startTime && endTime <= startTime ? "L'heure de fin doit etre apres l'heure de debut (ex: 17:00 pour 5 PM)" : "Format 24h (ex: 17:00 pour 5 PM)"}
                </p>
              </div>
            </div>

            {/* Slot duration */}
            <div>
              <label className="label">Duree des creneaux (minutes)</label>
              <select className="input-field" value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))}>
                {SLOT_DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </select>
            </div>

            {/* Breaks */}
            <div>
              <label className="label">Pauses (ex: dejeuner)</label>
              {breaks.map((b, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input type="time" className="input-field w-32" value={b.start} onChange={(e) => updateBreak(i, "start", e.target.value)} />
                  <span className="text-slate-400 text-sm">a</span>
                  <input type="time" className="input-field w-32" value={b.end} onChange={(e) => updateBreak(i, "end", e.target.value)} />
                  <button type="button" onClick={() => removeBreak(i)} className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addBreak} className="btn-secondary text-sm flex items-center gap-1 mt-1">
                <Plus size={14} /> Ajouter une pause
              </button>
            </div>

            {/* Min delay & max horizon */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Delai minimum (heures)</label>
                <input type="number" className="input-field" value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} min={0} />
                <p className="text-xs text-slate-400 mt-1">RDV minimum {minDelay}h a l&apos;avance</p>
              </div>
              <div>
                <label className="label">Planifier jusqu&apos;a (jours)</label>
                <input type="number" className="input-field" value={maxHorizon} onChange={(e) => setMaxHorizon(Number(e.target.value))} min={1} />
                <p className="text-xs text-slate-400 mt-1">Jusqu&apos;a {maxHorizon} jours a l&apos;avance</p>
              </div>
            </div>
          </div>
        )}
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
            {/* Always transfer */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-slate-900 w-4 h-4" checked={alwaysTransfer} onChange={(e) => setAlwaysTransfer(e.target.checked)} />
              <span className="text-sm text-slate-700">Toujours transferer les appels (sans condition)</span>
            </label>

            {/* Conditions */}
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
                        <input className="input-field" value={cond.name} onChange={(e) => updateCondition(cond.id, "name", e.target.value)} placeholder="ex: Transfert vers support FR" />
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

                      {/* Time restriction */}
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

            {/* Default transfer number */}
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
            <h3 className="text-base font-semibold text-slate-900 m-0">Notifications SMS</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900" />
          </label>
        </div>
        <p className="text-sm text-slate-500 mb-4">Envoyer automatiquement un SMS de confirmation apres chaque rendez-vous pris</p>

        {smsEnabled && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
            <Info size={18} className="shrink-0 mt-0.5" />
            <p className="m-0">
              Les SMS seront envoyes via Twilio en utilisant le template configure dans la table <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">sms_templates</code>. Assurez-vous que votre compte Twilio est configure et que vous avez suffisamment de credits.
            </p>
          </div>
        )}
      </div>

      {/* ========== Section 6: Email Notifications ========== */}
      <div className="border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-slate-600" />
            <h3 className="text-base font-semibold text-slate-900 m-0">Notifications Email</h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900" />
          </label>
        </div>
        <p className="text-sm text-slate-500 mb-4">Envoyer un email de confirmation au client apres la prise de rendez-vous</p>

        {emailEnabled && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
            <Info size={18} className="shrink-0 mt-0.5" />
            <p className="m-0">
              L&apos;email sera envoye via votre integration Google/Microsoft configuree dans les parametres, ou via Resend en fallback. Le client doit fournir son adresse email pendant l&apos;appel.
            </p>
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
