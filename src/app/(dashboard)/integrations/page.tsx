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

// ===================== MAIN PAGE =====================
export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
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

  // Handle OAuth callback redirect params
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

  // Check if a card is connected (provider is active)
  const isCardConnected = (card: IntegrationCard): boolean => {
    return !!getIntegration(card.provider);
  };

  // Check if the conflicting card is active (e.g. Google Calendar connected blocks Outlook Calendar)
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

  // Fallback icon component when image not found
  const CardIcon = ({ card }: { card: IntegrationCard }) => {
    const isCalendar = card.category === "calendar";
    const color = card.provider === "google" ? "#4285F4" : "#0078D4";
    const bgColor = card.provider === "google" ? "#EFF6FF" : "#E0F2FE";

    return (
      <div
        style={{
          width: "3rem",
          height: "3rem",
          borderRadius: "0.75rem",
          backgroundColor: bgColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color,
          flexShrink: 0,
        }}
      >
        {isCalendar ? <Calendar size={24} /> : <Mail size={24} />}
      </div>
    );
  };

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
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#111827",
              margin: 0,
            }}
          >
            Integrations
          </h1>
          <p
            style={{
              color: "#6b7280",
              marginTop: "0.25rem",
              fontSize: "0.875rem",
            }}
          >
            Connectez vos services externes pour etendre les fonctionnalites
          </p>
        </div>
        <button
          onClick={fetchIntegrations}
          className="btn-secondary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      {/* Content */}
      {loading ? (
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
      ) : (
        <div
          style={{
            display: "grid",
            gap: "1.5rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {INTEGRATION_CARDS.map((card) => {
            const connected = isCardConnected(card);
            const conflicting = !connected && isConflicting(card);

            return (
              <div
                key={card.id}
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  textAlign: "center",
                  alignItems: "center",
                  padding: "1.5rem",
                }}
              >
                {/* Icon */}
                <CardIcon card={card} />

                {/* Name */}
                <h3
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: 600,
                    color: "#111827",
                    margin: "0.75rem 0 0.5rem",
                  }}
                >
                  {card.name}
                </h3>

                {/* Description or conflict warning */}
                {conflicting ? (
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "#b45309",
                      lineHeight: 1.5,
                      margin: 0,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.375rem",
                      textAlign: "left",
                    }}
                  >
                    <AlertTriangle
                      size={14}
                      style={{ flexShrink: 0, marginTop: "0.125rem" }}
                    />
                    {card.conflictMessage}
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "#6b7280",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {card.description}
                  </p>
                )}

                {/* Action button */}
                <div style={{ marginTop: "auto", width: "100%", paddingTop: "1rem" }}>
                  {connected ? (
                    <button
                      className="btn-secondary"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        backgroundColor: "#ecfdf5",
                        color: "#059669",
                        border: "1px solid #a7f3d0",
                        cursor: "default",
                        position: "relative",
                      }}
                      onClick={() => handleDisconnect(card.provider)}
                      title="Cliquez pour deconnecter"
                    >
                      <CheckCircle size={14} />
                      Connecte
                    </button>
                  ) : (
                    <button
                      className="btn-primary"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        opacity: conflicting ? 0.6 : 1,
                      }}
                      onClick={() => handleConnect(card)}
                      disabled={conflicting || connecting === card.id}
                    >
                      {connecting === card.id ? (
                        <RefreshCw
                          size={14}
                          style={{ animation: "spin 1s linear infinite" }}
                        />
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
