"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Calendar,
  Clock,
  MapPin,
  User,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Link as LinkIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { syncCalendar } from "@/lib/elevenlabs";
import { formatTime } from "@/lib/utils";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  parseISO,
  addHours,
} from "date-fns";
import { fr } from "date-fns/locale";
import type { Appointment, Integration } from "@/types/database";
import { useRouter } from "next/navigation";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  location?: string;
  source: "local" | "external";
  status?: string;
  contact?: { first_name: string; last_name: string } | null;
}

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  scheduled: { bg: "#EFF6FF", color: "#2563EB", label: "Planifie" },
  confirmed: { bg: "#ECFDF5", color: "#059669", label: "Confirme" },
  cancelled: { bg: "#FEE2E2", color: "#DC2626", label: "Annule" },
  completed: { bg: "#dcfce7", color: "#15803d", label: "Termine" },
  no_show: { bg: "#FEF3C7", color: "#D97706", label: "Absent" },
};

export default function RendezVousPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_at: "",
    end_at: "",
    location: "",
    contact_id: "",
    agent_id: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  // Check active calendar integration
  const fetchIntegration = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("is_active", true)
        .in("provider", ["google", "microsoft"])
        .limit(1)
        .maybeSingle();
      setIntegration(data as Integration | null);
    } catch {
      setIntegration(null);
    }
  }, []);

  const fetchAppointments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("appointments")
      .select("*, contact:contacts(first_name, last_name)")
      .order("start_at", { ascending: true });
    setAppointments((data as Appointment[]) || []);
  }, []);

  const fetchExternalEvents = useCallback(async () => {
    if (!integration) return;
    setLoadingExternal(true);
    try {
      const result = await syncCalendar("list") as { events?: CalendarEvent[] };
      if (result.events) {
        setExternalEvents(
          result.events.map((e: CalendarEvent) => ({
            ...e,
            id: e.id || crypto.randomUUID(),
            source: "external" as const,
          }))
        );
      }
    } catch {
      // Silently fail — user may see the banner
    } finally {
      setLoadingExternal(false);
    }
  }, [integration]);

  const fetchContacts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("contacts").select("id, first_name, last_name").order("last_name");
    if (data) setContacts(data);
  }, []);

  const fetchAgents = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("agents").select("id, name").order("name");
    if (data) setAgents(data);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([fetchIntegration(), fetchAppointments(), fetchContacts(), fetchAgents()]);
      } catch {
        // Ensure page renders even if a fetch fails
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchIntegration, fetchAppointments, fetchContacts, fetchAgents]);

  useEffect(() => {
    if (integration) fetchExternalEvents();
  }, [integration, fetchExternalEvents]);

  // Merge local + external events
  const allEvents = useMemo<CalendarEvent[]>(() => {
    const local: CalendarEvent[] = appointments.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      start_at: a.start_at,
      end_at: a.end_at,
      location: a.location,
      source: "local",
      status: a.status,
      contact: a.contact as { first_name: string; last_name: string } | null,
    }));
    return [...local, ...externalEvents].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [appointments, externalEvents]);

  // Calendar grid days
  const calendarDays = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: gridStart, end: gridEnd });
    } else {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }
  }, [currentDate, viewMode]);

  // Events for a specific day
  const getEventsForDay = useCallback(
    (day: Date) => allEvents.filter((e) => isSameDay(parseISO(e.start_at), day)),
    [allEvents]
  );

  // Events for selected day panel
  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return getEventsForDay(selectedDay);
  }, [selectedDay, getEventsForDay]);

  // Navigation
  const goNext = () => {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addWeeks(currentDate, 1));
  };
  const goPrev = () => {
    if (viewMode === "month") setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subWeeks(currentDate, 1));
  };
  const goToday = () => setCurrentDate(new Date());

  // CRUD
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.start_at || !form.end_at) return;
    setSubmitting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Non connecte"); setSubmitting(false); return; }

    const { error } = await supabase.from("appointments").insert({
      user_id: user.id,
      title: form.title,
      description: form.description,
      start_at: form.start_at,
      end_at: form.end_at,
      location: form.location,
      contact_id: form.contact_id || null,
      agent_id: form.agent_id || null,
    });

    if (error) {
      toast.error("Erreur lors de la creation");
    } else {
      // Also sync to external calendar if connected
      if (integration) {
        try {
          await syncCalendar("create", {
            title: form.title,
            description: form.description,
            start_at: new Date(form.start_at).toISOString(),
            end_at: new Date(form.end_at).toISOString(),
            location: form.location,
          });
        } catch {
          // Local creation succeeded, external sync failed
        }
      }
      toast.success("Rendez-vous cree !");
      setShowModal(false);
      setForm({ title: "", description: "", start_at: "", end_at: "", location: "", contact_id: "", agent_id: "" });
      fetchAppointments();
      if (integration) fetchExternalEvents();
    }
    setSubmitting(false);
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const supabase = createClient();
    const { error } = await supabase.from("appointments").update({ status: newStatus }).eq("id", id);
    if (error) toast.error("Erreur lors de la mise a jour");
    else { toast.success("Statut mis a jour"); fetchAppointments(); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce rendez-vous ?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) toast.error("Erreur lors de la suppression");
    else { toast.success("Rendez-vous supprime"); fetchAppointments(); }
  }

  // Open create modal with pre-filled date
  const openCreateForDay = (day: Date) => {
    const startHour = addHours(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0), 0);
    const endHour = addHours(startHour, 1);
    setForm({
      title: "",
      description: "",
      start_at: format(startHour, "yyyy-MM-dd'T'HH:mm"),
      end_at: format(endHour, "yyyy-MM-dd'T'HH:mm"),
      location: "",
      contact_id: "",
      agent_id: "",
    });
    setShowModal(true);
  };

  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}>
        <div style={{ width: "2rem", height: "2rem", border: "4px solid #FFEDD5", borderTopColor: "#F97316", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>Rendez-vous</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            {integration
              ? `Synchronise avec ${integration.provider === "google" ? "Google Calendar" : "Outlook Calendar"}`
              : "Gerez vos rendez-vous et planifications"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {!integration && (
            <button
              onClick={() => router.push("/integrations")}
              className="btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <LinkIcon size={16} />
              Connecter un calendrier
            </button>
          )}
          <button
            onClick={() => {
              setForm({ title: "", description: "", start_at: "", end_at: "", location: "", contact_id: "", agent_id: "" });
              setShowModal(true);
            }}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Plus size={16} /> Nouveau rendez-vous
          </button>
        </div>
      </div>

      {/* Integration banner */}
      {!integration && (
        <div
          className="card"
          style={{
            padding: "1rem 1.5rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            backgroundColor: "#FFF7ED",
            border: "1px solid #FDBA74",
          }}
        >
          <Calendar size={24} style={{ color: "#EA580C", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "#9A3412", fontSize: "0.875rem" }}>
              Aucun calendrier connecte
            </div>
            <div style={{ color: "#C2410C", fontSize: "0.8125rem", marginTop: "0.125rem" }}>
              Connectez Google Calendar ou Outlook pour voir tous vos evenements ici.
            </div>
          </div>
          <button
            onClick={() => router.push("/integrations")}
            className="btn-primary"
            style={{ flexShrink: 0, fontSize: "0.8125rem" }}
          >
            Connecter
          </button>
        </div>
      )}

      {/* Calendar navigation */}
      <div className="card" style={{ padding: "1rem 1.5rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button onClick={goPrev} className="btn-ghost" style={{ padding: "0.375rem" }}>
              <ChevronLeft size={20} />
            </button>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", margin: 0, minWidth: "200px", textAlign: "center" }}>
              {viewMode === "month"
                ? format(currentDate, "MMMM yyyy", { locale: fr }).replace(/^./, (c) => c.toUpperCase())
                : `Semaine du ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "d MMM", { locale: fr })} au ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "d MMM yyyy", { locale: fr })}`}
            </h2>
            <button onClick={goNext} className="btn-ghost" style={{ padding: "0.375rem" }}>
              <ChevronRight size={20} />
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {loadingExternal && (
              <Loader2 size={16} style={{ color: "#9ca3af", animation: "spin 1s linear infinite" }} />
            )}
            <button onClick={goToday} className="btn-secondary" style={{ fontSize: "0.8125rem", padding: "0.375rem 0.75rem" }}>
              Aujourd&apos;hui
            </button>
            <div style={{ display: "flex", borderRadius: "0.375rem", overflow: "hidden", border: "1px solid #e5e7eb" }}>
              <button
                onClick={() => setViewMode("month")}
                style={{
                  padding: "0.375rem 0.75rem",
                  fontSize: "0.8125rem",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: viewMode === "month" ? "#F97316" : "white",
                  color: viewMode === "month" ? "white" : "#6b7280",
                  fontWeight: viewMode === "month" ? 600 : 400,
                }}
              >
                Mois
              </button>
              <button
                onClick={() => setViewMode("week")}
                style={{
                  padding: "0.375rem 0.75rem",
                  fontSize: "0.8125rem",
                  border: "none",
                  borderLeft: "1px solid #e5e7eb",
                  cursor: "pointer",
                  backgroundColor: viewMode === "week" ? "#F97316" : "white",
                  color: viewMode === "week" ? "white" : "#6b7280",
                  fontWeight: viewMode === "week" ? 600 : 400,
                }}
              >
                Semaine
              </button>
            </div>
          </div>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", backgroundColor: "#e5e7eb" }}>
          {dayNames.map((name) => (
            <div
              key={name}
              style={{
                textAlign: "center",
                padding: "0.5rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#6b7280",
                backgroundColor: "#f9fafb",
                textTransform: "uppercase",
              }}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "1px",
            backgroundColor: "#e5e7eb",
            border: "1px solid #e5e7eb",
          }}
        >
          {calendarDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const today = isToday(day);

            return (
              <div
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                onDoubleClick={() => openCreateForDay(day)}
                style={{
                  backgroundColor: isSelected ? "#FFF7ED" : "white",
                  padding: "0.375rem",
                  minHeight: viewMode === "week" ? "180px" : "90px",
                  cursor: "pointer",
                  opacity: isCurrentMonth || viewMode === "week" ? 1 : 0.4,
                  transition: "background-color 0.15s",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "0.25rem",
                  }}
                >
                  <span
                    style={{
                      width: "1.625rem",
                      height: "1.625rem",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: today ? 700 : 500,
                      backgroundColor: today ? "#F97316" : isSelected ? "#FFEDD5" : "transparent",
                      color: today ? "white" : isSelected ? "#EA580C" : "#374151",
                    }}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* Event dots / compact list */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  {dayEvents.slice(0, viewMode === "week" ? 8 : 3).map((evt) => (
                    <div
                      key={evt.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedEvent(evt); }}
                      style={{
                        fontSize: "0.625rem",
                        padding: "1px 4px",
                        borderRadius: "2px",
                        backgroundColor: evt.source === "external" ? "#EDE9FE" : "#DBEAFE",
                        color: evt.source === "external" ? "#7C3AED" : "#1D4ED8",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        lineHeight: "1.4",
                        cursor: "pointer",
                      }}
                      title={`${formatTime(evt.start_at)} - ${evt.title}`}
                    >
                      {formatTime(evt.start_at)} {evt.title}
                    </div>
                  ))}
                  {dayEvents.length > (viewMode === "week" ? 8 : 3) && (
                    <div style={{ fontSize: "0.625rem", color: "#9ca3af", textAlign: "center" }}>
                      +{dayEvents.length - (viewMode === "week" ? 8 : 3)} autres
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", fontSize: "0.75rem", color: "#6b7280" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: "#DBEAFE", display: "inline-block" }} />
            Rendez-vous locaux
          </div>
          {integration && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: "#EDE9FE", display: "inline-block" }} />
              {integration.provider === "google" ? "Google Calendar" : "Outlook Calendar"}
            </div>
          )}
        </div>
      </div>

      {/* Selected day detail panel */}
      {selectedDay && (
        <div className="card" style={{ padding: "1.25rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", margin: 0 }}>
              {format(selectedDay, "EEEE d MMMM yyyy", { locale: fr }).replace(/^./, (c) => c.toUpperCase())}
            </h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => openCreateForDay(selectedDay)}
                className="btn-primary"
                style={{ fontSize: "0.8125rem", padding: "0.375rem 0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
              >
                <Plus size={14} /> Ajouter
              </button>
              <button onClick={() => setSelectedDay(null)} className="btn-ghost" style={{ padding: "0.25rem" }}>
                <X size={18} />
              </button>
            </div>
          </div>

          {selectedDayEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 0", color: "#9ca3af" }}>
              <Calendar size={32} style={{ margin: "0 auto 0.5rem", opacity: 0.5 }} />
              <p style={{ fontSize: "0.875rem", margin: 0 }}>Aucun evenement ce jour</p>
              <p style={{ fontSize: "0.75rem", margin: "0.25rem 0 0" }}>Double-cliquez sur un jour pour creer un rendez-vous</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {selectedDayEvents.map((evt) => {
                const s = evt.status ? STATUS_COLORS[evt.status] : null;
                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      borderRadius: "0.5rem",
                      backgroundColor: evt.source === "external" ? "#FAFAFF" : "#FAFBFF",
                      border: `1px solid ${evt.source === "external" ? "#E9E5FF" : "#E5E7EB"}`,
                      cursor: "pointer",
                      transition: "box-shadow 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)")}
                    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                  >
                    {/* Time bar */}
                    <div
                      style={{
                        width: "3px",
                        height: "2.5rem",
                        borderRadius: "2px",
                        backgroundColor: evt.source === "external" ? "#7C3AED" : "#F97316",
                        flexShrink: 0,
                      }}
                    />

                    {/* Time */}
                    <div style={{ minWidth: "3.5rem", textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827" }}>
                        {formatTime(evt.start_at)}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "#9ca3af" }}>
                        {formatTime(evt.end_at)}
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#111827", fontSize: "0.875rem" }}>{evt.title}</div>
                      <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "#6b7280", marginTop: "0.125rem", flexWrap: "wrap" }}>
                        {evt.location && (
                          <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                            <MapPin size={10} /> {evt.location}
                          </span>
                        )}
                        {evt.contact && (
                          <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                            <User size={10} /> {evt.contact.first_name} {evt.contact.last_name}
                          </span>
                        )}
                        {evt.source === "external" && (
                          <span style={{ color: "#7C3AED", fontStyle: "italic" }}>
                            {integration?.provider === "google" ? "Google" : "Outlook"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions (only for local events) */}
                    {evt.source === "local" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                        {s && (
                          <select
                            className="input-field"
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.4rem",
                              width: "auto",
                              backgroundColor: s.bg,
                              color: s.color,
                              fontWeight: 500,
                              border: "none",
                              borderRadius: "0.25rem",
                            }}
                            value={evt.status}
                            onChange={(e) => handleStatusChange(evt.id, e.target.value)}
                          >
                            {Object.entries(STATUS_COLORS).map(([key, val]) => (
                              <option key={key} value={key}>{val.label}</option>
                            ))}
                          </select>
                        )}
                        <button
                          className="btn-ghost"
                          style={{ padding: "0.25rem", color: "#ef4444" }}
                          onClick={() => handleDelete(evt.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Event detail modal */}
      {selectedEvent && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setSelectedEvent(null)} />
          <div style={{ position: "relative", backgroundColor: "white", borderRadius: "1rem", padding: "1.5rem", width: "100%", maxWidth: "28rem", margin: "0 1rem", maxHeight: "90vh", overflow: "auto" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0 }}>
                <div style={{
                  width: "3rem",
                  height: "3rem",
                  borderRadius: "0.75rem",
                  backgroundColor: selectedEvent.source === "external" ? "#EDE9FE" : "#FFF7ED",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: "0.5625rem", fontWeight: 600, color: selectedEvent.source === "external" ? "#7C3AED" : "#F97316", textTransform: "uppercase" }}>
                    {format(parseISO(selectedEvent.start_at), "MMM", { locale: fr })}
                  </span>
                  <span style={{ fontSize: "1.125rem", fontWeight: 700, color: selectedEvent.source === "external" ? "#5B21B6" : "#EA580C", lineHeight: 1 }}>
                    {format(parseISO(selectedEvent.start_at), "d")}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#111827", margin: 0, wordBreak: "break-word" }}>
                    {selectedEvent.title}
                  </h2>
                  {selectedEvent.source === "external" && (
                    <span style={{ fontSize: "0.75rem", color: "#7C3AED", fontStyle: "italic" }}>
                      {integration?.provider === "google" ? "Google Calendar" : "Outlook Calendar"}
                    </span>
                  )}
                  {selectedEvent.status && STATUS_COLORS[selectedEvent.status] && (
                    <span style={{
                      display: "inline-block",
                      fontSize: "0.6875rem",
                      fontWeight: 500,
                      padding: "0.125rem 0.5rem",
                      borderRadius: "9999px",
                      backgroundColor: STATUS_COLORS[selectedEvent.status].bg,
                      color: STATUS_COLORS[selectedEvent.status].color,
                      marginTop: "0.25rem",
                    }}>
                      {STATUS_COLORS[selectedEvent.status].label}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="btn-ghost" style={{ padding: "0.25rem", flexShrink: 0 }}>
                <X size={20} />
              </button>
            </div>

            {/* Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              {/* Date & Time */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <Clock size={16} style={{ color: "#6b7280", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.875rem", color: "#111827", fontWeight: 500 }}>
                    {format(parseISO(selectedEvent.start_at), "EEEE d MMMM yyyy", { locale: fr }).replace(/^./, (c) => c.toUpperCase())}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
                    {formatTime(selectedEvent.start_at)} — {formatTime(selectedEvent.end_at)}
                  </div>
                </div>
              </div>

              {/* Location */}
              {selectedEvent.location && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <MapPin size={16} style={{ color: "#6b7280", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.875rem", color: "#111827" }}>{selectedEvent.location}</span>
                </div>
              )}

              {/* Contact */}
              {selectedEvent.contact && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <User size={16} style={{ color: "#6b7280", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.875rem", color: "#111827" }}>
                    {selectedEvent.contact.first_name} {selectedEvent.contact.last_name}
                  </span>
                </div>
              )}

              {/* Description */}
              {selectedEvent.description && (
                <div style={{
                  backgroundColor: "#f9fafb",
                  borderRadius: "0.5rem",
                  padding: "0.75rem 1rem",
                  fontSize: "0.8125rem",
                  color: "#374151",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  marginTop: "0.25rem",
                }}>
                  {selectedEvent.description}
                </div>
              )}
            </div>

            {/* Actions for local events */}
            {selectedEvent.source === "local" && (
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid #f3f4f6" }}>
                {selectedEvent.status && (
                  <select
                    className="input-field"
                    style={{
                      fontSize: "0.8125rem",
                      padding: "0.375rem 0.5rem",
                      width: "auto",
                      backgroundColor: STATUS_COLORS[selectedEvent.status]?.bg || "#f3f4f6",
                      color: STATUS_COLORS[selectedEvent.status]?.color || "#374151",
                      fontWeight: 500,
                      border: "none",
                      borderRadius: "0.375rem",
                    }}
                    value={selectedEvent.status}
                    onChange={(e) => {
                      handleStatusChange(selectedEvent.id, e.target.value);
                      setSelectedEvent({ ...selectedEvent, status: e.target.value });
                    }}
                  >
                    {Object.entries(STATUS_COLORS).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                )}
                <button
                  className="btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", color: "#ef4444", borderColor: "#fecaca", fontSize: "0.8125rem" }}
                  onClick={() => {
                    handleDelete(selectedEvent.id);
                    setSelectedEvent(null);
                  }}
                >
                  <Trash2 size={14} />
                  Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowModal(false)} />
          <div style={{ position: "relative", backgroundColor: "white", borderRadius: "1rem", padding: "1.5rem", width: "100%", maxWidth: "28rem", margin: "0 1rem", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Nouveau rendez-vous</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: "0.25rem" }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="label">Titre *</label>
                <input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label className="label">Debut *</label>
                  <input type="datetime-local" className="input-field" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} required />
                </div>
                <div>
                  <label className="label">Fin *</label>
                  <input type="datetime-local" className="input-field" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="label">Contact</label>
                <select className="input-field" value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}>
                  <option value="">Aucun contact</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Agent associe</label>
                <select className="input-field" value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
                  <option value="">Aucun agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Lieu</label>
                <input className="input-field" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input-field" style={{ minHeight: "60px" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {integration && (
                <div style={{ fontSize: "0.75rem", color: "#059669", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <Calendar size={12} />
                  Sera aussi ajoute a {integration.provider === "google" ? "Google Calendar" : "Outlook Calendar"}
                </div>
              )}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
                <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creation..." : "Creer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
