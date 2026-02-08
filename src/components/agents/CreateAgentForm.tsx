"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Link2, X, FileText, Globe, Play, Square } from "lucide-react";
import { SUPPORTED_LANGUAGES, LLM_MODELS, DEFAULT_FORM_VALUES } from "@/lib/constants";
import { listVoices, createAgent, updateAgent, uploadKnowledgeBase } from "@/lib/elevenlabs";
import { createClient } from "@/lib/supabase/client";
import type { Voice, CreateAgentFormData } from "@/types/elevenlabs";
import type { KnowledgeBaseItem } from "@/types/database";

interface Props {
  onCreated: () => void;
  editMode?: boolean;
  agentId?: string;
  initialData?: Partial<CreateAgentFormData>;
}

export default function CreateAgentForm({ onCreated, editMode, agentId, initialData }: Props) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [kbFiles, setKbFiles] = useState<File[]>([]);
  const [kbUrls, setKbUrls] = useState<string[]>([]);
  const [kbUrlInput, setKbUrlInput] = useState("");
  const [existingKbItems, setExistingKbItems] = useState<KnowledgeBaseItem[]>([]);
  const [form, setForm] = useState<CreateAgentFormData>({
    name: initialData?.name || "",
    systemPrompt: initialData?.systemPrompt || "",
    firstMessage: initialData?.firstMessage || "",
    language: initialData?.language || DEFAULT_FORM_VALUES.language,
    voiceId: initialData?.voiceId || "",
    llmModel: initialData?.llmModel || DEFAULT_FORM_VALUES.llmModel,
    temperature: initialData?.temperature ?? DEFAULT_FORM_VALUES.temperature,
    maxDurationSeconds: initialData?.maxDurationSeconds ?? DEFAULT_FORM_VALUES.maxDurationSeconds,
    stability: initialData?.stability ?? DEFAULT_FORM_VALUES.stability,
    similarityBoost: initialData?.similarityBoost ?? DEFAULT_FORM_VALUES.similarityBoost,
    speed: initialData?.speed ?? DEFAULT_FORM_VALUES.speed,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  useEffect(() => {
    listVoices()
      .then((data) => {
        const voiceList = data.voices || [];
        setVoices(voiceList);
        if (!editMode && !form.voiceId && voiceList.length > 0) {
          setForm((prev) => ({ ...prev, voiceId: voiceList[0].voice_id }));
        }
      })
      .catch(() => toast.error("Impossible de charger les voix"))
      .finally(() => setLoadingVoices(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load existing KB items in edit mode
  useEffect(() => {
    if (!editMode || !agentId) return;
    const supabase = createClient();
    supabase
      .from("knowledge_base_items")
      .select("*")
      .eq("elevenlabs_agent_id", agentId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setExistingKbItems(data as KnowledgeBaseItem[]);
      });
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

  const [loadingPreview, setLoadingPreview] = useState(false);

  const toggleVoicePreview = useCallback(async () => {
    if (!form.voiceId) return;

    // If already playing, stop it
    if (playingVoiceId && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoiceId(null);
      return;
    }

    // Determine text to speak
    const textToSpeak = form.firstMessage.trim() || "Bonjour, comment puis-je vous aider ?";

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setLoadingPreview(true);
    setPlayingVoiceId(form.voiceId);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Non connecte"); return; }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/text-to-speech`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ voice_id: form.voiceId, text: textToSpeak }),
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
  }, [form.voiceId, form.firstMessage, playingVoiceId]);

  const updateField = (field: keyof CreateAgentFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.voiceId) {
      toast.error("Le nom et la voix sont obligatoires");
      return;
    }

    setSubmitting(true);
    try {
      let targetAgentId = agentId;
      if (editMode && agentId) {
        await updateAgent(agentId, form as unknown as Record<string, unknown>);
      } else {
        const result = await createAgent(form as unknown as Record<string, unknown>);
        targetAgentId = result.agent_id;
      }

      // Upload knowledge base files and URLs
      if (targetAgentId && (kbFiles.length > 0 || kbUrls.length > 0)) {
        const kbTotal = kbFiles.length + kbUrls.length;
        let kbDone = 0;
        for (const file of kbFiles) {
          try {
            await uploadKnowledgeBase(targetAgentId, file);
            kbDone++;
            toast.success(`Fichier ${kbDone}/${kbTotal} uploade: ${file.name}`);
          } catch {
            toast.error(`Erreur upload: ${file.name}`);
          }
        }
        for (const url of kbUrls) {
          try {
            await uploadKnowledgeBase(targetAgentId, undefined, url);
            kbDone++;
            toast.success(`URL ${kbDone}/${kbTotal} ajoutee`);
          } catch {
            toast.error(`Erreur ajout URL: ${url}`);
          }
        }
      }

      onCreated();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Nom de l'agent */}
      <div>
        <label className="label">Nom de l&apos;agent *</label>
        <input
          type="text"
          className="input-field"
          placeholder="Ex: Assistant commercial"
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          required
        />
      </div>

      {/* Prompt systeme */}
      <div>
        <label className="label">Prompt systeme</label>
        <textarea
          className="input-field min-h-[120px] resize-y"
          placeholder="Decrivez le role et le comportement de l'agent..."
          value={form.systemPrompt}
          onChange={(e) => updateField("systemPrompt", e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1">
          Instructions qui definissent la personnalite et les capacites de l&apos;agent
        </p>
      </div>

      {/* Premier message */}
      <div>
        <label className="label">Premier message</label>
        <input
          type="text"
          className="input-field"
          placeholder="Bonjour, comment puis-je vous aider ?"
          value={form.firstMessage}
          onChange={(e) => updateField("firstMessage", e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1">
          Le message que l&apos;agent prononcera au debut de la conversation
        </p>
      </div>

      {/* Langue et Voix */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Langue</label>
          <select
            className="input-field"
            value={form.language}
            onChange={(e) => updateField("language", e.target.value)}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Voix *</label>
          {loadingVoices ? (
            <div className="input-field flex items-center gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement...
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                className="input-field flex-1"
                value={form.voiceId}
                onChange={(e) => {
                  // Stop current preview if voice changes
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current = null;
                    setPlayingVoiceId(null);
                  }
                  updateField("voiceId", e.target.value);
                }}
                required
              >
                <option value="">-- Selectionnez une voix --</option>
                {voices.map((voice) => (
                  <option key={voice.voice_id} value={voice.voice_id}>
                    {voice.name} ({voice.category})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={toggleVoicePreview}
                disabled={!form.voiceId || loadingPreview}
                className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${
                  playingVoiceId === form.voiceId
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={playingVoiceId === form.voiceId ? "Arreter" : "Ecouter le premier message"}
              >
                {loadingPreview ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : playingVoiceId === form.voiceId ? (
                  <Square size={14} />
                ) : (
                  <Play size={14} />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modele LLM */}
      <div>
        <label className="label">Modele LLM</label>
        <select
          className="input-field"
          value={form.llmModel}
          onChange={(e) => updateField("llmModel", e.target.value)}
        >
          {LLM_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </div>

      {/* Temperature slider */}
      <div>
        <label className="label">
          Temperature : {form.temperature}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={form.temperature}
          onChange={(e) => updateField("temperature", parseFloat(e.target.value))}
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
            <label className="label">Stabilite : {form.stability}</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.stability}
              onChange={(e) => updateField("stability", parseFloat(e.target.value))}
              className="w-full accent-slate-900"
            />
          </div>
          <div>
            <label className="label">Similarite : {form.similarityBoost}</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.similarityBoost}
              onChange={(e) => updateField("similarityBoost", parseFloat(e.target.value))}
              className="w-full accent-slate-900"
            />
          </div>
          <div>
            <label className="label">Vitesse : {form.speed}</label>
            <input
              type="range" min="0.5" max="2" step="0.1"
              value={form.speed}
              onChange={(e) => updateField("speed", parseFloat(e.target.value))}
              className="w-full accent-slate-900"
            />
          </div>
          <div>
            <label className="label">Duree max (secondes)</label>
            <input
              type="number"
              className="input-field"
              value={form.maxDurationSeconds}
              onChange={(e) => updateField("maxDurationSeconds", parseInt(e.target.value))}
              min={60}
              max={3600}
            />
          </div>
        </div>
      </details>

      {/* Base de connaissances */}
      <details className="border border-slate-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-slate-700">
          Base de connaissances (PDF, TXT, URLs)
        </summary>
        <div className="px-4 pb-4 flex flex-col gap-4">
          {/* Existing KB items (edit mode) */}
          {existingKbItems.length > 0 && (
            <div>
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

          {/* File upload */}
          <div>
            <label className="label flex items-center gap-1">
              <Upload size={14} />
              Fichiers (PDF, TXT)
            </label>
            <input
              type="file"
              accept=".pdf,.txt"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setKbFiles((prev) => [...prev, ...files]);
                e.target.value = "";
              }}
              className="text-sm"
            />
            {kbFiles.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {kbFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-2 py-1.5 bg-slate-50 rounded-md text-[0.8125rem]"
                  >
                    <span className="flex items-center gap-1.5">
                      <FileText size={14} className="text-slate-900" />
                      {file.name}
                      <span className="text-slate-400">
                        ({(file.size / 1024).toFixed(0)} Ko)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setKbFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 bg-transparent border-none cursor-pointer p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* URL input */}
          <div>
            <label className="label flex items-center gap-1">
              <Link2 size={14} />
              URLs
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                className="input-field flex-1"
                placeholder="https://example.com/documentation"
                value={kbUrlInput}
                onChange={(e) => setKbUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (kbUrlInput.trim()) {
                      setKbUrls((prev) => [...prev, kbUrlInput.trim()]);
                      setKbUrlInput("");
                    }
                  }
                }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (kbUrlInput.trim()) {
                    setKbUrls((prev) => [...prev, kbUrlInput.trim()]);
                    setKbUrlInput("");
                  }
                }}
              >
                Ajouter
              </button>
            </div>
            {kbUrls.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {kbUrls.map((url, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-2 py-1.5 bg-slate-50 rounded-md text-[0.8125rem]"
                  >
                    <span className="flex items-center gap-1.5 overflow-hidden">
                      <Globe size={14} className="text-slate-900 shrink-0" />
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{url}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setKbUrls((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 bg-transparent border-none cursor-pointer p-0.5 shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 m-0">
            Les fichiers et URLs seront ajoutes comme base de connaissances apres la creation de l&apos;agent.
          </p>
        </div>
      </details>

      {/* Submit */}
      <button type="submit" disabled={submitting} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting
          ? (editMode ? "Mise a jour..." : "Creation en cours...")
          : (editMode ? "Enregistrer les modifications" : "Creer l'agent")}
      </button>
    </form>
  );
}
