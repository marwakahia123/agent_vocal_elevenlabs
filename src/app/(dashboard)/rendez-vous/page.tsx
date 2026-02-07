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
import { AnimatePresence, motion } from "framer-motion";
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.id)
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("appointments")
      .select("*, contact:contacts(first_name, last_name)")
      .eq("user_id", user.id)
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("contacts").select("id, first_name, last_name").eq("user_id", user.id).order("last_name");
    if (data) setContacts(data);
  }, []);

  const fetchAgents = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("agents").select("id, name").eq("user_id", user.id).order("name");
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
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Rendez-vous</h1>
          <p className="text-sm text-slate-500 mt-1">
            {integration
              ? `Synchronise avec ${integration.provider === "google" ? "Google Calendar" : "Outlook Calendar"}`
              : "Gerez vos rendez-vous et planifications"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {!integration && (
            <button
              onClick={() => router.push("/integrations")}
              className="btn-secondary flex items-center gap-2"
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
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} /> Nouveau rendez-vous
          </button>
        </div>
      </div>

      {/* Integration banner */}
      {!integration && (
        <div className="card px-6 py-4 mb-6 flex items-center gap-4 bg-blue-50 border border-blue-200">
          <Calendar size={24} className="text-blue-700 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-blue-900 text-sm">
              Aucun calendrier connecte
            </div>
            <div className="text-blue-700 text-[0.8125rem] mt-0.5">
              Connectez Google Calendar ou Outlook pour voir tous vos evenements ici.
            </div>
          </div>
          <button
            onClick={() => router.push("/integrations")}
            className="btn-primary shrink-0 text-[0.8125rem]"
          >
            Connecter
          </button>
        </div>
      )}

      {/* Calendar navigation */}
      <div className="card px-6 py-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={goPrev} className="btn-ghost p-1.5">
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-lg font-semibold text-slate-900 m-0 min-w-[200px] text-center">
              {viewMode === "month"
                ? format(currentDate, "MMMM yyyy", { locale: fr }).replace(/^./, (c) => c.toUpperCase())
                : `Semaine du ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "d MMM", { locale: fr })} au ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "d MMM yyyy", { locale: fr })}`}
            </h2>
            <button onClick={goNext} className="btn-ghost p-1.5">
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="flex gap-2 items-center">
            {loadingExternal && (
              <Loader2 size={16} className="text-slate-400 animate-spin" />
            )}
            <button onClick={goToday} className="btn-secondary text-[0.8125rem] py-1.5 px-3">
              Aujourd&apos;hui
            </button>
            <div className="flex rounded-md overflow-hidden border border-slate-200">
              <button
                onClick={() => setViewMode("month")}
                className={`py-1.5 px-3 text-[0.8125rem] border-none cursor-pointer ${
                  viewMode === "month"
                    ? "bg-slate-900 text-white font-semibold"
                    : "bg-white text-slate-500"
                }`}
              >
                Mois
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`py-1.5 px-3 text-[0.8125rem] border-none border-l border-slate-200 cursor-pointer ${
                  viewMode === "week"
                    ? "bg-slate-900 text-white font-semibold"
                    : "bg-white text-slate-500"
                }`}
              >
                Semaine
              </button>
            </div>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px bg-slate-200">
          {dayNames.map((name) => (
            <div
              key={name}
              className="text-center py-2 text-xs font-semibold text-slate-500 bg-slate-50 uppercase"
            >
              {name}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200">
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
                className={`p-1.5 cursor-pointer transition-colors relative ${
                  isSelected ? "bg-slate-50" : "bg-white"
                }`}
                style={{
                  minHeight: viewMode === "week" ? "180px" : "90px",
                  opacity: isCurrentMonth || viewMode === "week" ? 1 : 0.4,
                }}
              >
                <div className="flex justify-center mb-1">
                  <span
                    className={`w-[1.625rem] h-[1.625rem] rounded-full flex items-center justify-center text-xs ${
                      today
                        ? "bg-slate-900 text-white font-bold"
                        : isSelected
                        ? "bg-slate-200 text-slate-900 font-medium"
                        : "text-slate-700 font-medium"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* Event dots / compact list */}
                <div className="flex flex-col gap-px">
                  {dayEvents.slice(0, viewMode === "week" ? 8 : 3).map((evt) => (
                    <div
                      key={evt.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedEvent(evt); }}
                      className="text-[0.625rem] px-1 rounded-sm whitespace-nowrap overflow-hidden text-ellipsis leading-snug cursor-pointer"
                      style={{
                        backgroundColor: evt.source === "external" ? "#EDE9FE" : "#DBEAFE",
                        color: evt.source === "external" ? "#7C3AED" : "#1D4ED8",
                      }}
                      title={`${formatTime(evt.start_at)} - ${evt.title}`}
                    >
                      {formatTime(evt.start_at)} {evt.title}
                    </div>
                  ))}
                  {dayEvents.length > (viewMode === "week" ? 8 : 3) && (
                    <div className="text-[0.625rem] text-slate-400 text-center">
                      +{dayEvents.length - (viewMode === "week" ? 8 : 3)} autres
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-3 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-blue-100 inline-block" />
            Rendez-vous locaux
          </div>
          {integration && (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-violet-100 inline-block" />
              {integration.provider === "google" ? "Google Calendar" : "Outlook Calendar"}
            </div>
          )}
        </div>
      </div>

      {/* Selected day detail panel */}
      {selectedDay && (
        <div className="card px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 m-0">
              {format(selectedDay, "EEEE d MMMM yyyy", { locale: fr }).replace(/^./, (c) => c.toUpperCase())}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => openCreateForDay(selectedDay)}
                className="btn-primary text-[0.8125rem] py-1.5 px-3 flex items-center gap-1.5"
              >
                <Plus size={14} /> Ajouter
              </button>
              <button onClick={() => setSelectedDay(null)} className="btn-ghost p-1">
                <X size={18} />
              </button>
            </div>
          </div>

          {selectedDayEvents.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Calendar size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm m-0">Aucun evenement ce jour</p>
              <p className="text-xs mt-1 m-0">Double-cliquez sur un jour pour creer un rendez-vous</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedDayEvents.map((evt) => {
                const s = evt.status ? STATUS_COLORS[evt.status] : null;
                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-shadow hover:shadow-md"
                    style={{
                      backgroundColor: evt.source === "external" ? "#FAFAFF" : "#FAFBFF",
                      border: `1px solid ${evt.source === "external" ? "#E9E5FF" : "#E5E7EB"}`,
                    }}
                  >
                    {/* Time bar */}
                    <div
                      className="w-[3px] h-10 rounded-sm shrink-0"
                      style={{
                        backgroundColor: evt.source === "external" ? "#7C3AED" : "#0f172a",
                      }}
                    />

                    {/* Time */}
                    <div className="min-w-[3.5rem] text-center shrink-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {formatTime(evt.start_at)}
                      </div>
                      <div className="text-[0.6875rem] text-slate-400">
                        {formatTime(evt.end_at)}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 text-sm">{evt.title}</div>
                      <div className="flex gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                        {evt.location && (
                          <span className="flex items-center gap-0.5">
                            <MapPin size={10} /> {evt.location}
                          </span>
                        )}
                        {evt.contact && (
                          <span className="flex items-center gap-0.5">
                            <User size={10} /> {evt.contact.first_name} {evt.contact.last_name}
                          </span>
                        )}
                        {evt.source === "external" && (
                          <span className="text-violet-600 italic">
                            {integration?.provider === "google" ? "Google" : "Outlook"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions (only for local events) */}
                    {evt.source === "local" && (
                      <div className="flex items-center gap-2 shrink-0">
                        {s && (
                          <select
                            className="input-field text-xs py-0.5 px-1.5 w-auto font-medium border-none rounded"
                            style={{ backgroundColor: s.bg, color: s.color }}
                            value={evt.status}
                            onChange={(e) => handleStatusChange(evt.id, e.target.value)}
                          >
                            {Object.entries(STATUS_COLORS).map(([key, val]) => (
                              <option key={key} value={key}>{val.label}</option>
                            ))}
                          </select>
                        )}
                        <button
                          className="btn-ghost p-1 text-red-500"
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
      <AnimatePresence>
        {selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedEvent(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-auto"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0"
                    style={{
                      backgroundColor: selectedEvent.source === "external" ? "#EDE9FE" : "#f1f5f9",
                    }}
                  >
                    <span
                      className="text-[0.5625rem] font-semibold uppercase"
                      style={{ color: selectedEvent.source === "external" ? "#7C3AED" : "#0f172a" }}
                    >
                      {format(parseISO(selectedEvent.start_at), "MMM", { locale: fr })}
                    </span>
                    <span
                      className="text-lg font-bold leading-none"
                      style={{ color: selectedEvent.source === "external" ? "#5B21B6" : "#0f172a" }}
                    >
                      {format(parseISO(selectedEvent.start_at), "d")}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-slate-900 m-0 break-words">
                      {selectedEvent.title}
                    </h2>
                    {selectedEvent.source === "external" && (
                      <span className="text-xs text-violet-600 italic">
                        {integration?.provider === "google" ? "Google Calendar" : "Outlook Calendar"}
                      </span>
                    )}
                    {selectedEvent.status && STATUS_COLORS[selectedEvent.status] && (
                      <span
                        className="inline-block text-[0.6875rem] font-medium px-2 py-0.5 rounded-full mt-1"
                        style={{
                          backgroundColor: STATUS_COLORS[selectedEvent.status].bg,
                          color: STATUS_COLORS[selectedEvent.status].color,
                        }}
                      >
                        {STATUS_COLORS[selectedEvent.status].label}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="btn-ghost p-1 shrink-0">
                  <X size={20} />
                </button>
              </div>

              {/* Details */}
              <div className="flex flex-col gap-3.5">
                {/* Date & Time */}
                <div className="flex items-center gap-2.5">
                  <Clock size={16} className="text-slate-500 shrink-0" />
                  <div>
                    <div className="text-sm text-slate-900 font-medium">
                      {format(parseISO(selectedEvent.start_at), "EEEE d MMMM yyyy", { locale: fr }).replace(/^./, (c) => c.toUpperCase())}
                    </div>
                    <div className="text-[0.8125rem] text-slate-500">
                      {formatTime(selectedEvent.start_at)} — {formatTime(selectedEvent.end_at)}
                    </div>
                  </div>
                </div>

                {/* Location */}
                {selectedEvent.location && (
                  <div className="flex items-center gap-2.5">
                    <MapPin size={16} className="text-slate-500 shrink-0" />
                    <span className="text-sm text-slate-900">{selectedEvent.location}</span>
                  </div>
                )}

                {/* Contact */}
                {selectedEvent.contact && (
                  <div className="flex items-center gap-2.5">
                    <User size={16} className="text-slate-500 shrink-0" />
                    <span className="text-sm text-slate-900">
                      {selectedEvent.contact.first_name} {selectedEvent.contact.last_name}
                    </span>
                  </div>
                )}

                {/* Description */}
                {selectedEvent.description && (
                  <div className="bg-slate-50 rounded-lg px-4 py-3 text-[0.8125rem] text-slate-700 leading-relaxed whitespace-pre-wrap mt-1">
                    {selectedEvent.description}
                  </div>
                )}
              </div>

              {/* Actions for local events */}
              {selectedEvent.source === "local" && (
                <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-slate-100">
                  {selectedEvent.status && (
                    <select
                      className="input-field text-[0.8125rem] py-1.5 px-2 w-auto font-medium border-none rounded-md"
                      style={{
                        backgroundColor: STATUS_COLORS[selectedEvent.status]?.bg || "#f3f4f6",
                        color: STATUS_COLORS[selectedEvent.status]?.color || "#374151",
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
                    className="btn-secondary flex items-center gap-1.5 text-red-500 border-red-200 text-[0.8125rem]"
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold m-0">Nouveau rendez-vous</h2>
                <button onClick={() => setShowModal(false)} className="btn-ghost p-1">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <label className="label">Titre *</label>
                  <input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                  <textarea className="input-field min-h-[60px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                {integration && (
                  <div className="text-xs text-emerald-600 flex items-center gap-1.5">
                    <Calendar size={12} />
                    Sera aussi ajoute a {integration.provider === "google" ? "Google Calendar" : "Outlook Calendar"}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
                  <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creation..." : "Creer"}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
