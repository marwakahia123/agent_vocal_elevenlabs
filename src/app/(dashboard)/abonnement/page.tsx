"use client";

import { useState } from "react";
import { Check, Crown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

const plans = [
  {
    id: "free",
    name: "Gratuit",
    price: 0,
    period: "",
    features: ["1 agent vocal", "60 minutes/mois", "100 contacts", "Historique 7 jours"],
    limits: { agents: 1, minutes: 60, contacts: 100 },
  },
  {
    id: "starter",
    name: "Starter",
    price: 29,
    period: "/mois",
    features: ["5 agents vocaux", "500 minutes/mois", "5 000 contacts", "1 numero de telephone", "Historique 30 jours", "Widgets embedables", "Support email"],
    limits: { agents: 5, minutes: 500, contacts: 5000 },
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 79,
    period: "/mois",
    features: ["Agents illimites", "2 000 minutes/mois", "Contacts illimites", "5 numeros de telephone", "Historique illimite", "Integrations Calendar", "Campagnes sortantes", "SMS", "Support prioritaire"],
    limits: { agents: -1, minutes: 2000, contacts: -1 },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 199,
    period: "/mois",
    features: ["Tout de Pro", "10 000 minutes/mois", "Numeros illimites", "API personnalisee", "SLA garanti", "Manager dedie", "Formation equipe"],
    limits: { agents: -1, minutes: 10000, contacts: -1 },
  },
];

export default function AbonnementPage() {
  const { profile, refreshProfile } = useAuth();
  const currentPlan = profile?.plan || "free";
  const [changingPlan, setChangingPlan] = useState<string | null>(null);

  async function handleChangePlan(planId: string) {
    if (planId === currentPlan || !profile) return;

    const planName = plans.find((p) => p.id === planId)?.name || planId;
    const isDowngrade = plans.findIndex((p) => p.id === planId) < plans.findIndex((p) => p.id === currentPlan);

    if (!confirm(`${isDowngrade ? "Reclasser" : "Mettre a niveau"} vers le plan ${planName} ?`)) return;

    setChangingPlan(planId);
    const supabase = createClient();

    const planLimits = plans.find((p) => p.id === planId)?.limits;

    const { error } = await supabase
      .from("profiles")
      .update({
        plan: planId,
        minutes_limit: planLimits?.minutes || 60,
      })
      .eq("id", profile.id);

    if (error) {
      toast.error("Erreur lors du changement de plan");
    } else {
      // Log billing event
      await supabase.from("billing_events").insert({
        user_id: profile.id,
        event_type: "plan_change",
        amount_euros: plans.find((p) => p.id === planId)?.price || 0,
        description: `Changement de plan: ${currentPlan} -> ${planId}`,
        metadata: { from_plan: currentPlan, to_plan: planId },
      });

      toast.success(`Plan mis a jour vers ${planName} !`);
      if (refreshProfile) refreshProfile();
    }
    setChangingPlan(null);
  }

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>Abonnement</h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>Gerez votre plan et votre facturation</p>
      </div>

      {/* Current usage */}
      {profile && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>Utilisation actuelle</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.375rem" }}>Minutes utilisees</div>
              <div style={{ height: "8px", backgroundColor: "#f3f4f6", borderRadius: "4px", overflow: "hidden", marginBottom: "0.25rem" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min((profile.minutes_used / profile.minutes_limit) * 100, 100)}%`,
                  backgroundColor: profile.minutes_used / profile.minutes_limit > 0.9 ? "#EF4444" : "#F97316",
                  borderRadius: "4px",
                }} />
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#374151" }}>
                <strong>{profile.minutes_used}</strong> / {profile.minutes_limit} min
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.375rem" }}>Plan actuel</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Crown size={16} style={{ color: "#F97316" }} />
                <span style={{ fontWeight: 600, color: "#111827", textTransform: "capitalize" }}>
                  {plans.find((p) => p.id === currentPlan)?.name || currentPlan}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plans */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1.5rem" }}>
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isChanging = changingPlan === plan.id;
          return (
            <div
              key={plan.id}
              className="card"
              style={{
                position: "relative",
                border: isCurrent ? "2px solid #F97316" : plan.popular ? "2px solid #F97316" : undefined,
                opacity: isCurrent ? 1 : undefined,
              }}
            >
              {plan.popular && !isCurrent && (
                <div style={{
                  position: "absolute",
                  top: "-0.75rem",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "#F97316",
                  color: "white",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  padding: "0.125rem 0.75rem",
                  borderRadius: "9999px",
                }}>
                  POPULAIRE
                </div>
              )}
              {isCurrent && (
                <div style={{
                  position: "absolute",
                  top: "-0.75rem",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "#F97316",
                  color: "white",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  padding: "0.125rem 0.75rem",
                  borderRadius: "9999px",
                }}>
                  ACTUEL
                </div>
              )}

              <div style={{ textAlign: "center", marginBottom: "1.25rem", paddingTop: plan.popular || isCurrent ? "0.5rem" : 0 }}>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", margin: 0 }}>{plan.name}</h3>
                <div style={{ marginTop: "0.5rem" }}>
                  <span style={{ fontSize: "2rem", fontWeight: 700, color: "#111827" }}>
                    {plan.price === 0 ? "Gratuit" : formatCurrency(plan.price)}
                  </span>
                  {plan.period && <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>{plan.period}</span>}
                </div>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {plan.features.map((feature) => (
                  <li key={feature} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.8125rem", color: "#4b5563" }}>
                    <Check size={16} style={{ color: "#F97316", flexShrink: 0, marginTop: "0.125rem" }} />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                className={isCurrent ? "btn-secondary" : "btn-primary"}
                style={{ width: "100%", padding: "0.625rem" }}
                disabled={isCurrent || isChanging}
                onClick={() => handleChangePlan(plan.id)}
              >
                {isCurrent ? "Plan actuel" : isChanging ? "Changement..." : "Choisir ce plan"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
