"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Mail,
  CheckCircle,
  RefreshCw,
  Link,
  Unlink,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getGoogleAuthUrl, getMicrosoftAuthUrl } from "@/lib/elevenlabs";
import type { Integration } from "@/types/database";

interface IntegrationCard {
  id: string;
  provider: "google" | "microsoft";
  category: "calendar" | "email";
  name: string;
  description: string;
  icon: string;
  conflictWith: string;
  conflictMessage: string;
}

const INTEGRATION_CARDS: IntegrationCard[] = [
  {
    id: "google_calendar",
    provider: "google",
    category: "calendar",
    name: "Google Calendar",
    description:
      "Permettez a l'agent IA de creer des rendez-vous dans votre agenda Google automatiquement.",
    icon: "/icons/google-calendar.png",
    conflictWith: "microsoft_calendar",
    conflictMessage:
      "Google Calendar est deja connecte. Deconnectez-le d'abord pour utiliser Outlook Calendar.",
  },
  {
    id: "microsoft_calendar",
    provider: "microsoft",
    category: "calendar",
    name: "Outlook Calendar",
    description:
      "Synchronisez vos rendez-vous avec Outlook Calendar pour une gestion centralisee de votre agenda.",
    icon: "/icons/outlook-calendar.png",
    conflictWith: "google_calendar",
    conflictMessage:
      "Google Calendar est deja connecte. Deconnectez-le d'abord pour utiliser Outlook Calendar.",
  },
  {
    id: "google_email",
    provider: "google",
    category: "email",
    name: "Gmail",
    description:
      "Connectez votre compte Gmail pour envoyer et recevoir des emails automatiquement. L'agent peut envoyer des confirmations, rappels et notifications par email.",
    icon: "/icons/gmail.png",
    conflictWith: "microsoft_email",
    conflictMessage:
      "Gmail est deja connecte. Deconnectez-le d'abord pour utiliser Outlook.",
  },
  {
    id: "microsoft_email",
    provider: "microsoft",
    category: "email",
    name: "Microsoft Outlook",
    description:
      "Connectez votre compte Outlook pour envoyer des emails. L'agent peut envoyer des confirmations, rappels et notifications.",
    icon: "/icons/outlook.png",
    conflictWith: "google_email",
    conflictMessage:
      "Gmail est deja connecte. Deconnectez-le d'abord pour utiliser Outlook.",
  },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setIntegrations((data as Integration[]) || []);
    } catch {
      toast.error("Erreur lors du chargement des integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      const name = connected === "google" ? "Google" : "Microsoft";
      toast.success(`${name} connecte avec succes !`);
      window.history.replaceState({}, "", "/integrations");
      fetchIntegrations();
    }
    if (error) {
      toast.error(`Erreur de connexion: ${error}`);
      window.history.replaceState({}, "", "/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getIntegration = (provider: string): Integration | undefined => {
    return integrations.find(
      (i) => i.provider === provider && i.is_active === true
    );
  };

  const isCardConnected = (card: IntegrationCard): boolean => {
    return !!getIntegration(card.provider);
  };

  const isConflicting = (card: IntegrationCard): boolean => {
    const conflictCard = INTEGRATION_CARDS.find(
      (c) => c.id === card.conflictWith
    );
    if (!conflictCard) return false;
    return !!getIntegration(conflictCard.provider);
  };

  const handleConnect = async (card: IntegrationCard) => {
    setConnecting(card.id);
    try {
      const name = card.provider === "google" ? "Google" : "Microsoft";
      toast.info(`Redirection vers l'authentification ${name}...`);

      const { url } =
        card.provider === "google"
          ? await getGoogleAuthUrl()
          : await getMicrosoftAuthUrl();

      window.location.href = url;
    } catch {
      toast.error("Erreur lors de la redirection OAuth");
      setConnecting(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    if (!confirm("Deconnecter cette integration ?")) return;
    try {
      const supabase = createClient();
      const integration = getIntegration(provider);
      if (integration) {
        const { error } = await supabase
          .from("integrations")
          .update({
            is_active: false,
            access_token: null,
            refresh_token: null,
          })
          .eq("id", integration.id);
        if (error) throw error;
      }
      toast.success("Integration deconnectee");
      fetchIntegrations();
    } catch {
      toast.error("Erreur lors de la deconnexion");
    }
  };

  const CardIcon = ({ card }: { card: IntegrationCard }) => {
    const isCalendar = card.category === "calendar";
    const color = card.provider === "google" ? "#4285F4" : "#0078D4";
    const bgColor = card.provider === "google" ? "#EFF6FF" : "#E0F2FE";

    return (
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: bgColor, color }}
      >
        {isCalendar ? <Calendar size={24} /> : <Mail size={24} />}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">
            Integrations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Connectez vos services externes pour etendre les fonctionnalites
          </p>
        </div>
        <button
          onClick={fetchIntegrations}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {INTEGRATION_CARDS.map((card) => {
            const connected = isCardConnected(card);
            const conflicting = !connected && isConflicting(card);

            return (
              <div
                key={card.id}
                className="card flex flex-col text-center items-center p-6"
              >
                <CardIcon card={card} />

                <h3 className="text-lg font-semibold text-slate-900 mt-3 mb-2">
                  {card.name}
                </h3>

                {conflicting ? (
                  <p className="text-[0.8125rem] text-amber-700 leading-relaxed m-0 flex items-start gap-1.5 text-left">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    {card.conflictMessage}
                  </p>
                ) : (
                  <p className="text-[0.8125rem] text-slate-500 leading-relaxed m-0">
                    {card.description}
                  </p>
                )}

                <div className="mt-auto w-full pt-4">
                  {connected ? (
                    <button
                      className="btn-secondary w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 border-emerald-200"
                      onClick={() => handleDisconnect(card.provider)}
                      title="Cliquez pour deconnecter"
                    >
                      <CheckCircle size={14} />
                      Connecte
                    </button>
                  ) : (
                    <button
                      className="btn-primary w-full flex items-center justify-center gap-2"
                      style={{ opacity: conflicting ? 0.6 : 1 }}
                      onClick={() => handleConnect(card)}
                      disabled={conflicting || connecting === card.id}
                    >
                      {connecting === card.id ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Link size={14} />
                      )}
                      {connecting === card.id ? "Connexion..." : "Connecter"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
