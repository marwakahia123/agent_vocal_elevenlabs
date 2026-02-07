"use client";

import { useState, useEffect } from "react";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
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

const COLORS = ["#F97316", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444"];

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

        // Fetch agents count
        const { count: agentsCount } = await supabase
          .from("agents")
          .select("*", { count: "exact", head: true });

        // Fetch conversations
        const { data: conversations } = await supabase
          .from("conversations")
          .select("started_at, duration_seconds, call_type, status")
          .order("started_at", { ascending: false });

        // Fetch contacts count
        const { count: contactsCount } = await supabase
          .from("contacts")
          .select("*", { count: "exact", head: true });

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

        // Calls by day (last 7 days)
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

        // Calls by type
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
      <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}>
        <div style={{
          width: "2rem",
          height: "2rem",
          border: "4px solid #FFEDD5",
          borderTopColor: "#F97316",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }} />
      </div>
    );
  }

  const statCards = [
    { label: "Appels total", value: stats.totalCalls, icon: <Phone size={20} />, color: "#F97316", bg: "#FFF7ED" },
    { label: "Appels aujourd'hui", value: stats.callsToday, icon: <PhoneIncoming size={20} />, color: "#3B82F6", bg: "#EFF6FF" },
    { label: "Minutes utilisees", value: stats.totalMinutes, icon: <Clock size={20} />, color: "#10B981", bg: "#ECFDF5" },
    { label: "Agents actifs", value: stats.activeAgents, icon: <Bot size={20} />, color: "#8B5CF6", bg: "#F5F3FF" },
    { label: "Contacts", value: stats.totalContacts, icon: <Users size={20} />, color: "#EC4899", bg: "#FDF2F8" },
    { label: "Duree moy. (s)", value: stats.avgDuration, icon: <TrendingUp size={20} />, color: "#F59E0B", bg: "#FFFBEB" },
  ];

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>
          Tableau de bord
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          Bienvenue{profile?.full_name ? `, ${profile.full_name}` : ""} ! Voici un apercu de votre activite.
        </p>
      </div>

      {/* Stats grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: "1rem",
        marginBottom: "1.5rem",
      }}>
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }}>
        {/* Calls by day */}
        <div className="card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
            Activite des appels (7 derniers jours)
          </h2>
          {callsByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={callsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" fontSize={12} tickLine={false} />
                <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="appels" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: "2rem" }}>
              <p className="empty-state-desc">Aucun appel pour le moment</p>
            </div>
          )}
        </div>

        {/* Calls by type */}
        <div className="card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
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
            <div className="empty-state" style={{ padding: "2rem" }}>
              <Star size={24} style={{ color: "#d1d5db", marginBottom: "0.5rem" }} />
              <p className="empty-state-desc">Pas encore de donnees</p>
            </div>
          )}
        </div>
      </div>

      {/* Usage bar */}
      {profile && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", margin: 0 }}>
              Utilisation du forfait
            </h2>
            <span className="badge badge-info">
              {profile.plan === "free" ? "Gratuit" : profile.plan}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: "8px", backgroundColor: "#f3f4f6", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min((profile.minutes_used / profile.minutes_limit) * 100, 100)}%`,
                  backgroundColor: profile.minutes_used / profile.minutes_limit > 0.9 ? "#EF4444" : "#F97316",
                  borderRadius: "4px",
                  transition: "width 0.3s",
                }} />
              </div>
            </div>
            <span style={{ fontSize: "0.875rem", color: "#6b7280", whiteSpace: "nowrap" }}>
              {profile.minutes_used} / {profile.minutes_limit} min
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
