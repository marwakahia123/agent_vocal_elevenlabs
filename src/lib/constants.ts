export const SUPPORTED_LANGUAGES = [
  { code: "fr", label: "Francais" },
  { code: "en", label: "Anglais" },
  { code: "es", label: "Espagnol" },
  { code: "de", label: "Allemand" },
  { code: "it", label: "Italien" },
  { code: "pt", label: "Portugais" },
  { code: "pl", label: "Polonais" },
  { code: "hi", label: "Hindi" },
  { code: "zh", label: "Chinois" },
  { code: "ko", label: "Coreen" },
  { code: "ru", label: "Russe" },
  { code: "nl", label: "Neerlandais" },
  { code: "tr", label: "Turc" },
  { code: "sv", label: "Suedois" },
  { code: "id", label: "Indonesien" },
  { code: "ja", label: "Japonais" },
  { code: "ar", label: "Arabe" },
  { code: "ro", label: "Roumain" },
  { code: "da", label: "Danois" },
  { code: "fi", label: "Finnois" },
] as const;

export const LLM_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
] as const;

export const DEFAULT_FORM_VALUES = {
  language: "fr",
  llmModel: "gpt-4o-mini",
  temperature: 0.7,
  maxDurationSeconds: 600,
  stability: 0.5,
  similarityBoost: 0.8,
  speed: 1.0,
} as const;
