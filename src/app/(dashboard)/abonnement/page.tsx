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
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 m-0">Abonnement</h1>
        <p className="text-sm text-slate-500 mt-1">Gerez votre plan et votre facturation</p>
      </div>

      {/* Current usage */}
      {profile && (
        <div className="card mb-8">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Utilisation actuelle</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            <div>
              <div className="text-[0.8125rem] text-slate-500 mb-1.5">Minutes utilisees</div>
              <div className="h-2 bg-slate-100 rounded overflow-hidden mb-1">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.min((profile.minutes_used / profile.minutes_limit) * 100, 100)}%`,
                    backgroundColor: profile.minutes_used / profile.minutes_limit > 0.9 ? "#EF4444" : "#0f172a",
                  }}
                />
              </div>
              <div className="text-[0.8125rem] text-slate-700">
                <strong>{profile.minutes_used}</strong> / {profile.minutes_limit} min
              </div>
            </div>
            <div>
              <div className="text-[0.8125rem] text-slate-500 mb-1.5">Plan actuel</div>
              <div className="flex items-center gap-1.5">
                <Crown size={16} className="text-slate-900" />
                <span className="font-semibold text-slate-900 capitalize">
                  {plans.find((p) => p.id === currentPlan)?.name || currentPlan}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plans */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isChanging = changingPlan === plan.id;
          return (
            <div
              key={plan.id}
              className="card relative"
              style={{
                border: isCurrent ? "2px solid #0f172a" : plan.popular ? "2px solid #0f172a" : undefined,
              }}
            >
              {plan.popular && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[0.6875rem] font-semibold px-3 py-0.5 rounded-full">
                  POPULAIRE
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[0.6875rem] font-semibold px-3 py-0.5 rounded-full">
                  ACTUEL
                </div>
              )}

              <div className={`text-center mb-5 ${plan.popular || isCurrent ? "pt-2" : ""}`}>
                <h3 className="text-lg font-semibold text-slate-900 m-0">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-slate-900">
                    {plan.price === 0 ? "Gratuit" : formatCurrency(plan.price)}
                  </span>
                  {plan.period && <span className="text-sm text-slate-500">{plan.period}</span>}
                </div>
              </div>

              <ul className="list-none p-0 mb-5 flex flex-col gap-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[0.8125rem] text-slate-600">
                    <Check size={16} className="text-slate-900 shrink-0 mt-0.5" />
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
