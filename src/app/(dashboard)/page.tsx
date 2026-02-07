"use client";

import { useState, useEffect } from "react";
import {
  Phone,
  PhoneIncoming,
  Clock,
  Users,
  Bot,
  TrendingUp,
  Star,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface Stats {
  totalCalls: number;
  totalMinutes: number;
  activeAgents: number;
  totalContacts: number;
  callsToday: number;
  avgDuration: number;
}

const COLORS = ["#0f172a", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444"];

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalCalls: 0,
    totalMinutes: 0,
    activeAgents: 0,
    totalContacts: 0,
    callsToday: 0,
    avgDuration: 0,
  });
  const [callsByDay, setCallsByDay] = useState<{ date: string; appels: number }[]>([]);
  const [callsByType, setCallsByType] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { count: agentsCount } = await supabase
          .from("agents")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);

        const { data: conversations } = await supabase
          .from("conversations")
          .select("started_at, duration_seconds, call_type, status")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false });

        const { count: contactsCount } = await supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);

        const convs = conversations || [];
        const totalCalls = convs.length;
        const totalMinutes = convs.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) / 60;

        const today = new Date().toISOString().split("T")[0];
        const callsToday = convs.filter(
          (c) => c.started_at?.startsWith(today)
        ).length;

        const avgDuration = totalCalls > 0
          ? convs.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) / totalCalls
          : 0;

        setStats({
          totalCalls,
          totalMinutes: Math.round(totalMinutes),
          activeAgents: agentsCount || 0,
          totalContacts: contactsCount || 0,
          callsToday,
          avgDuration: Math.round(avgDuration),
        });

        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return d.toISOString().split("T")[0];
        });

        setCallsByDay(
          last7Days.map((date) => ({
            date: date.slice(5),
            appels: convs.filter((c) => c.started_at?.startsWith(date)).length,
          }))
        );

        const typeMap: Record<string, number> = {};
        convs.forEach((c) => {
          const t = c.call_type || "test";
          typeMap[t] = (typeMap[t] || 0) + 1;
        });
        const typeLabels: Record<string, string> = {
          inbound: "Entrant",
          outbound: "Sortant",
          widget: "Widget",
          test: "Test",
        };
        setCallsByType(
          Object.entries(typeMap).map(([key, value]) => ({
            name: typeLabels[key] || key,
            value,
          }))
        );
      } catch {
        // Stats will remain at 0
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  const statCards = [
    { label: "Appels total", value: stats.totalCalls, icon: <Phone size={20} />, color: "#0f172a", bg: "#f1f5f9" },
    { label: "Appels aujourd'hui", value: stats.callsToday, icon: <PhoneIncoming size={20} />, color: "#3B82F6", bg: "#EFF6FF" },
    { label: "Minutes utilisees", value: stats.totalMinutes, icon: <Clock size={20} />, color: "#10B981", bg: "#ECFDF5" },
    { label: "Agents actifs", value: stats.activeAgents, icon: <Bot size={20} />, color: "#8B5CF6", bg: "#F5F3FF" },
    { label: "Contacts", value: stats.totalContacts, icon: <Users size={20} />, color: "#EC4899", bg: "#FDF2F8" },
    { label: "Duree moy. (s)", value: stats.avgDuration, icon: <TrendingUp size={20} />, color: "#F59E0B", bg: "#FFFBEB" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 m-0">
          Tableau de bord
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Bienvenue{profile?.full_name ? `, ${profile.full_name}` : ""} ! Voici un apercu de votre activite.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="stat-card-value">{card.value}</div>
                <div className="stat-card-label">{card.label}</div>
              </div>
              <div className="stat-card-icon" style={{ backgroundColor: card.bg, color: card.color }}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <div className="card">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Activite des appels (7 derniers jours)
          </h2>
          {callsByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={callsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" fontSize={12} tickLine={false} />
                <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="appels" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state p-8">
              <p className="empty-state-desc">Aucun appel pour le moment</p>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Repartition par type
          </h2>
          {callsByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={callsByType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={(props: PieLabelRenderProps) => `${props.name ?? ""} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}
                >
                  {callsByType.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state p-8">
              <Star size={24} className="text-slate-300 mb-2" />
              <p className="empty-state-desc">Pas encore de donnees</p>
            </div>
          )}
        </div>
      </div>

      {/* Usage bar */}
      {profile && (
        <div className="card mt-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-base font-semibold text-slate-900 m-0">
              Utilisation du forfait
            </h2>
            <span className="badge badge-info">
              {profile.plan === "free" ? "Gratuit" : profile.plan}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-2 bg-slate-100 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${Math.min((profile.minutes_used / profile.minutes_limit) * 100, 100)}%`,
                    backgroundColor: profile.minutes_used / profile.minutes_limit > 0.9 ? "#EF4444" : "#0f172a",
                  }}
                />
              </div>
            </div>
            <span className="text-sm text-slate-500 whitespace-nowrap">
              {profile.minutes_used} / {profile.minutes_limit} min
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
