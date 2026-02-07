"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Link2, X, FileText, Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, LLM_MODELS, DEFAULT_FORM_VALUES } from "@/lib/constants";
import { listVoices, createAgent, updateAgent, uploadKnowledgeBase } from "@/lib/elevenlabs";
import type { Voice, CreateAgentFormData } from "@/types/elevenlabs";

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
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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
          className="input-field"
          style={{ minHeight: "120px", resize: "vertical" }}
          placeholder="Decrivez le role et le comportement de l'agent..."
          value={form.systemPrompt}
          onChange={(e) => updateField("systemPrompt", e.target.value)}
        />
        <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
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
        <p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
          Le message que l&apos;agent prononcera au debut de la conversation
        </p>
      </div>

      {/* Langue et Voix */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
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
            <div className="input-field" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#9ca3af" }}>
              <Loader2 style={{ height: "1rem", width: "1rem", animation: "spin 1s linear infinite" }} />
              Chargement...
            </div>
          ) : (
            <select
              className="input-field"
              value={form.voiceId}
              onChange={(e) => updateField("voiceId", e.target.value)}
              required
            >
              <option value="">-- Selectionnez une voix --</option>
              {voices.map((voice) => (
                <option key={voice.voice_id} value={voice.voice_id}>
                  {voice.name} ({voice.category})
                </option>
              ))}
            </select>
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
          style={{ width: "100%", accentColor: "#F97316" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#9ca3af" }}>
          <span>Precis</span>
          <span>Creatif</span>
        </div>
      </div>

      {/* Parametres avances */}
      <details style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
        <summary style={{ padding: "0.75rem 1rem", cursor: "pointer", fontSize: "0.875rem", fontWeight: 500, color: "#374151" }}>
          Parametres avances de la voix
        </summary>
        <div style={{ padding: "0 1rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label className="label">Stabilite : {form.stability}</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.stability}
              onChange={(e) => updateField("stability", parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#F97316" }}
            />
          </div>
          <div>
            <label className="label">Similarite : {form.similarityBoost}</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.similarityBoost}
              onChange={(e) => updateField("similarityBoost", parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#F97316" }}
            />
          </div>
          <div>
            <label className="label">Vitesse : {form.speed}</label>
            <input
              type="range" min="0.5" max="2" step="0.1"
              value={form.speed}
              onChange={(e) => updateField("speed", parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#F97316" }}
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
      <details style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
        <summary style={{ padding: "0.75rem 1rem", cursor: "pointer", fontSize: "0.875rem", fontWeight: 500, color: "#374151" }}>
          Base de connaissances (PDF, TXT, URLs)
        </summary>
        <div style={{ padding: "0 1rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* File upload */}
          <div>
            <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
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
              style={{ fontSize: "0.875rem" }}
            />
            {kbFiles.length > 0 && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {kbFiles.map((file, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.375rem 0.5rem",
                      backgroundColor: "#f9fafb",
                      borderRadius: "0.375rem",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <FileText size={14} style={{ color: "#F97316" }} />
                      {file.name}
                      <span style={{ color: "#9ca3af" }}>
                        ({(file.size / 1024).toFixed(0)} Ko)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setKbFiles((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "0.125rem" }}
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
            <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <Link2 size={14} />
              URLs
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="url"
                className="input-field"
                style={{ flex: 1 }}
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
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {kbUrls.map((url, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.375rem 0.5rem",
                      backgroundColor: "#f9fafb",
                      borderRadius: "0.375rem",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", overflow: "hidden" }}>
                      <Globe size={14} style={{ color: "#F97316", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setKbUrls((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "0.125rem", flexShrink: 0 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: 0 }}>
            Les fichiers et URLs seront ajoutes comme base de connaissances apres la creation de l&apos;agent.
          </p>
        </div>
      </details>

      {/* Submit */}
      <button type="submit" disabled={submitting} className="btn-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%", padding: "0.75rem" }}>
        {submitting && <Loader2 style={{ height: "1rem", width: "1rem", animation: "spin 1s linear infinite" }} />}
        {submitting
          ? (editMode ? "Mise a jour..." : "Creation en cours...")
          : (editMode ? "Enregistrer les modifications" : "Creer l'agent")}
      </button>
    </form>
  );
}
