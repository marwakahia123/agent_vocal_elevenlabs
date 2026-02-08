import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAY_MAP: Record<number, string> = {
  0: "dim", 1: "lun", 2: "mar", 3: "mer", 4: "jeu", 5: "ven", 6: "sam",
};

const DAY_LABELS: Record<string, string> = {
  lun: "Lundi", mar: "Mardi", mer: "Mercredi",
  jeu: "Jeudi", ven: "Vendredi", sam: "Samedi", dim: "Dimanche",
};

// Map French day names to JS getDay() index (0=dim, 1=lun, etc.)
const FRENCH_DAY_TO_INDEX: Record<string, number> = {
  dimanche: 0, dim: 0,
  lundi: 1, lun: 1,
  mardi: 2, mar: 2,
  mercredi: 3, mer: 3,
  jeudi: 4, jeu: 4,
  vendredi: 5, ven: 5,
  samedi: 6, sam: 6,
};

// Map French month names to month number (1-indexed)
const FRENCH_MONTH_TO_NUM: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, février: 2, fev: 2, fév: 2,
  mars: 3, mar: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8, août: 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, décembre: 12, dec: 12, déc: 12,
};

// ========== Timezone Helpers ==========
// Business hours are in Europe/Paris but Deno runs in UTC.
// All date/time logic must use these helpers.
const TIMEZONE = "Europe/Paris";

/** Get YYYY-MM-DD in business timezone */
function toTzDateStr(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** Get HH:MM in business timezone */
function toTzTimeStr(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const h = parts.find(p => p.type === "hour")!.value;
  const m = parts.find(p => p.type === "minute")!.value;
  return `${h}:${m}`;
}

/** Get day of week (0=Sunday..6=Saturday) in business timezone */
function getTzDayOfWeek(date: Date): number {
  const dayStr = date.toLocaleDateString("en-US", { timeZone: TIMEZONE, weekday: "short" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayStr] ?? 0;
}

/** Get hours and minutes as total minutes in business timezone */
function toTzMinutes(date: Date): number {
  const timeStr = toTzTimeStr(date);
  return timeToMinutes(timeStr);
}

/**
 * Resolve a relative or descriptive date string to YYYY-MM-DD.
 * Accepts: "lundi", "mardi", "demain", "aujourd'hui", "semaine prochaine", or YYYY-MM-DD.
 * All calculations use Europe/Paris timezone.
 */
function resolveDate(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const now = new Date();
  const todayStr = toTzDateStr(now);
  const currentDayOfWeek = getTzDayOfWeek(now);

  // Already a YYYY-MM-DD date?
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // "aujourd'hui" / "today"
  if (trimmed === "aujourd'hui" || trimmed === "aujourdhui" || trimmed === "today") {
    return todayStr;
  }

  // "demain" / "tomorrow"
  if (trimmed === "demain" || trimmed === "tomorrow") {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return toTzDateStr(tomorrow);
  }

  // Day of the week name → find next occurrence
  const dayIndex = FRENCH_DAY_TO_INDEX[trimmed];
  if (dayIndex !== undefined) {
    let daysAhead = dayIndex - currentDayOfWeek;
    if (daysAhead <= 0) daysAhead += 7; // next week if today or past
    const target = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    return toTzDateStr(target);
  }

  // "semaine prochaine" / "next week" → next Monday
  if (trimmed.includes("semaine prochaine") || trimmed.includes("next week")) {
    const daysToMonday = currentDayOfWeek === 0 ? 1 : 8 - currentDayOfWeek;
    const target = new Date(now.getTime() + daysToMonday * 24 * 60 * 60 * 1000);
    return toTzDateStr(target);
  }

  // "cette semaine" / "this week" → today
  if (trimmed.includes("cette semaine") || trimmed.includes("this week")) {
    return todayStr;
  }

  // French date format: "10 février", "le 12 février", "10 février 2026", "le 12 fevrier 2026"
  const frenchDateMatch = trimmed.replace(/^le\s+/, "").match(/^(\d{1,2})\s+([a-zéûà]+)(?:\s+(\d{4}))?$/);
  if (frenchDateMatch) {
    const day = parseInt(frenchDateMatch[1]);
    const monthName = frenchDateMatch[2];
    const yearStr = frenchDateMatch[3];
    const month = FRENCH_MONTH_TO_NUM[monthName];
    if (month && day >= 1 && day <= 31) {
      const year = yearStr ? parseInt(yearStr) : parseInt(todayStr.split("-")[0]);
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }
  }

  // Fallback: return as-is
  return trimmed;
}

// ========== Calendar Integration ==========

interface CalendarBusySlot {
  start: string; // HH:MM in Europe/Paris
  end: string;   // HH:MM in Europe/Paris
}

async function refreshGoogleToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Failed to refresh Google token");
  const data = await res.json();
  await supabase
    .from("integrations")
    .update({
      access_token: data.access_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google");
  return data.access_token;
}

async function refreshMicrosoftToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("MICROSOFT_CLIENT_ID") || "",
        client_secret: Deno.env.get("MICROSOFT_CLIENT_SECRET") || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }
  );
  if (!res.ok) throw new Error("Failed to refresh Microsoft token");
  const data = await res.json();
  await supabase
    .from("integrations")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "microsoft");
  return data.access_token;
}

/**
 * Fetch busy slots from connected calendar (Google or Microsoft) for a given date.
 * Times are extracted in Europe/Paris timezone.
 * Returns empty array if no calendar is connected (graceful fallback).
 */
async function getCalendarBusySlots(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  dateStr: string
): Promise<CalendarBusySlot[]> {
  try {
    // Find active calendar integration
    const { data: integrations } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .in("provider", ["google", "microsoft"]);

    const integration = integrations?.[0] as Record<string, unknown> | undefined;
    if (!integration) {
      console.log("[Calendar] No calendar integration found — skipping");
      return [];
    }

    const provider = integration.provider as string;
    let accessToken = integration.access_token as string;
    const tokenExpiry = new Date(integration.token_expires_at as string);

    // Refresh token if expired
    if (tokenExpiry < new Date()) {
      console.log(`[Calendar] Token expired, refreshing ${provider} token...`);
      const refreshToken = integration.refresh_token as string;
      if (provider === "google") {
        accessToken = await refreshGoogleToken(supabase, userId, refreshToken);
      } else {
        accessToken = await refreshMicrosoftToken(supabase, userId, refreshToken);
      }
    }

    // Use Europe/Paris timezone boundaries for fetching
    // We want events on ${dateStr} in Paris time
    // Paris is UTC+1 (CET) or UTC+2 (CEST), so fetch a wide UTC range to cover both
    const dayStartUTC = `${dateStr}T00:00:00Z`;
    const dayEndUTC = `${dateStr}T23:59:59Z`;
    const busySlots: CalendarBusySlot[] = [];

    if (provider === "google") {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${dayStartUTC}&timeMax=${dayEndUTC}&singleEvents=true&orderBy=startTime`;
      console.log(`[Calendar] Fetching Google Calendar events: ${url}`);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[Calendar] Google returned ${(data.items || []).length} events`);
        for (const item of data.items || []) {
          const startDt = (item.start as Record<string, string>)?.dateTime;
          const endDt = (item.end as Record<string, string>)?.dateTime;
          if (startDt && endDt) {
            // Convert to Europe/Paris time
            const startTz = toTzTimeStr(new Date(startDt));
            const endTz = toTzTimeStr(new Date(endDt));
            console.log(`[Calendar] Event: ${item.summary || "?"} → ${startTz}-${endTz} (Paris)`);
            busySlots.push({ start: startTz, end: endTz });
          }
        }
      } else {
        const errorText = await res.text();
        console.log(`[Calendar] Google Calendar API error: ${res.status} — ${errorText}`);
      }
    } else {
      // Microsoft
      const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${dayStartUTC}&endDateTime=${dayEndUTC}&$orderby=start/dateTime`;
      console.log(`[Calendar] Fetching Microsoft Calendar events: ${url}`);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[Calendar] Microsoft returned ${(data.value || []).length} events`);
        for (const item of data.value || []) {
          const startDt = (item.start as Record<string, string>)?.dateTime;
          const endDt = (item.end as Record<string, string>)?.dateTime;
          if (startDt && endDt) {
            // Microsoft returns datetimes without timezone offset — they are in the calendar's timezone
            // Append Z only if no offset is present
            const startStr = startDt.includes("Z") || startDt.includes("+") ? startDt : startDt + "Z";
            const endStr = endDt.includes("Z") || endDt.includes("+") ? endDt : endDt + "Z";
            const startTz = toTzTimeStr(new Date(startStr));
            const endTz = toTzTimeStr(new Date(endStr));
            console.log(`[Calendar] Event: ${item.subject || "?"} → ${startTz}-${endTz} (Paris)`);
            busySlots.push({ start: startTz, end: endTz });
          }
        }
      } else {
        const errorText = await res.text();
        console.log(`[Calendar] Microsoft Calendar API error: ${res.status} — ${errorText}`);
      }
    }

    console.log(`[Calendar] Total busy slots: ${busySlots.length}`);
    return busySlots;
  } catch (err) {
    // Calendar check failed — don't block the flow, just skip
    console.log(`[Calendar] Error fetching calendar: ${(err as Error).message}`);
    return [];
  }
}

interface CalendarEventResult {
  eventId: string | null;
  meetingLink: string | null;
  provider: string | null;
}

/**
 * Create a calendar event on the connected calendar (Google or Microsoft).
 * Generates a Google Meet or Teams meeting link automatically.
 * Returns the external event ID and meeting link if successful.
 */
async function createCalendarEvent(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  startAt: string,
  endAt: string,
  description: string
): Promise<CalendarEventResult> {
  const empty: CalendarEventResult = { eventId: null, meetingLink: null, provider: null };
  try {
    const { data: integrations } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .in("provider", ["google", "microsoft"]);

    const integration = integrations?.[0] as Record<string, unknown> | undefined;
    if (!integration) return empty;

    const provider = integration.provider as string;
    let accessToken = integration.access_token as string;
    const tokenExpiry = new Date(integration.token_expires_at as string);

    if (tokenExpiry < new Date()) {
      const refreshToken = integration.refresh_token as string;
      if (provider === "google") {
        accessToken = await refreshGoogleToken(supabase, userId, refreshToken);
      } else {
        accessToken = await refreshMicrosoftToken(supabase, userId, refreshToken);
      }
    }

    if (provider === "google") {
      // Use conferenceDataVersion=1 to request Google Meet link
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title,
            description,
            start: { dateTime: startAt, timeZone: TIMEZONE },
            end: { dateTime: endAt, timeZone: TIMEZONE },
            conferenceData: {
              createRequest: {
                requestId: crypto.randomUUID(),
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        // Extract Google Meet link from conference data
        let meetingLink: string | null = null;
        if (data.conferenceData?.entryPoints) {
          const videoEntry = data.conferenceData.entryPoints.find(
            (ep: Record<string, string>) => ep.entryPointType === "video"
          );
          meetingLink = videoEntry?.uri || null;
        }
        // Fallback: hangoutLink field
        if (!meetingLink && data.hangoutLink) {
          meetingLink = data.hangoutLink;
        }
        console.log(`[Calendar] Google event created: ${data.id}, Meet link: ${meetingLink || "none"}`);
        return { eventId: data.id, meetingLink, provider: "google" };
      } else {
        const errorText = await res.text();
        console.log(`[Calendar] Google create error: ${res.status} — ${errorText}`);
      }
    } else {
      // Microsoft: use isOnlineMeeting to generate Teams link
      const res = await fetch(
        "https://graph.microsoft.com/v1.0/me/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: title,
            body: { contentType: "HTML", content: description },
            start: { dateTime: startAt, timeZone: TIMEZONE },
            end: { dateTime: endAt, timeZone: TIMEZONE },
            isOnlineMeeting: true,
            onlineMeetingProvider: "teamsForBusiness",
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const meetingLink = data.onlineMeeting?.joinUrl || null;
        console.log(`[Calendar] Microsoft event created: ${data.id}, Teams link: ${meetingLink || "none"}`);
        return { eventId: data.id, meetingLink, provider: "microsoft" };
      } else {
        const errorText = await res.text();
        console.log(`[Calendar] Microsoft create error: ${res.status} — ${errorText}`);
      }
    }
    return empty;
  } catch (err) {
    console.log(`[Calendar] Create event error: ${(err as Error).message}`);
    return empty;
  }
}

interface RdvConfig {
  id: string;
  agent_id: string;
  user_id: string;
  availability_enabled: boolean;
  working_days: string[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  breaks: { start: string; end: string }[];
  min_delay_hours: number;
  max_horizon_days: number;
  sms_notification_enabled: boolean;
  email_notification_enabled: boolean;
  webhook_secret: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function generateSlots(config: RdvConfig): string[] {
  const startMin = timeToMinutes(config.start_time);
  const endMin = timeToMinutes(config.end_time);
  const duration = config.slot_duration_minutes;
  const slots: string[] = [];

  for (let t = startMin; t + duration <= endMin; t += duration) {
    const slotStart = minutesToTime(t);
    const slotEnd = minutesToTime(t + duration);

    // Check if slot overlaps with any break
    const inBreak = (config.breaks || []).some((b) => {
      const bStart = timeToMinutes(b.start);
      const bEnd = timeToMinutes(b.end);
      return t < bEnd && t + duration > bStart;
    });

    if (!inBreak) {
      slots.push(`${slotStart}-${slotEnd}`);
    }
  }

  return slots;
}

async function handleCheckAvailability(
  supabase: ReturnType<typeof createClient>,
  config: RdvConfig,
  rawDateStr: string
): Promise<string> {
  const now = new Date();
  const todayStr = toTzDateStr(now);
  const todayDayOfWeek = getTzDayOfWeek(now);
  const todayDay = DAY_LABELS[DAY_MAP[todayDayOfWeek]] || "";
  const dateInfo = `[INFO: Aujourd'hui nous sommes le ${todayDay} ${todayStr}.]`;

  console.log(`[CheckAvailability] Raw input: "${rawDateStr}"`);
  console.log(`[CheckAvailability] Now (UTC): ${now.toISOString()}`);
  console.log(`[CheckAvailability] Today (Paris): ${todayStr} (${todayDay})`);
  console.log(`[CheckAvailability] Config: working_days=${JSON.stringify(config.working_days)}, start=${config.start_time}, end=${config.end_time}, duration=${config.slot_duration_minutes}, breaks=${JSON.stringify(config.breaks)}`);

  // Resolve relative date (lundi, demain, etc.) to YYYY-MM-DD
  const dateStr = resolveDate(rawDateStr);
  console.log(`[CheckAvailability] Resolved date: ${dateStr}`);

  // Parse date
  const date = new Date(dateStr + "T12:00:00Z"); // Use noon UTC to avoid date boundary issues
  if (isNaN(date.getTime())) {
    console.log(`[CheckAvailability] Invalid date: ${dateStr}`);
    return `${dateInfo} Date invalide. Veuillez fournir une date valide.`;
  }

  // Check if it's a working day — use the date string directly to get day of week
  const dateDayOfWeek = getTzDayOfWeek(date);
  const dayOfWeek = DAY_MAP[dateDayOfWeek];
  console.log(`[CheckAvailability] Date ${dateStr} → day of week: ${dayOfWeek} (${DAY_LABELS[dayOfWeek] || dayOfWeek})`);

  if (!config.working_days.includes(dayOfWeek)) {
    const workingDaysStr = config.working_days.map((d) => DAY_LABELS[d] || d).join(", ");
    return `${dateInfo} Le ${DAY_LABELS[dayOfWeek] || dayOfWeek} ${dateStr} n'est pas un jour de travail. Les jours disponibles sont : ${workingDaysStr}.`;
  }

  // Check min delay
  const minDelayMs = config.min_delay_hours * 60 * 60 * 1000;
  const minDate = new Date(now.getTime() + minDelayMs);
  const minDateStr = toTzDateStr(minDate);
  if (dateStr < minDateStr) {
    return `${dateInfo} Les rendez-vous doivent etre pris au minimum ${config.min_delay_hours}h a l'avance. La prochaine date possible est le ${minDateStr}.`;
  }

  // Check max horizon
  const maxDate = new Date(now.getTime() + config.max_horizon_days * 24 * 60 * 60 * 1000);
  const maxDateStr = toTzDateStr(maxDate);
  if (dateStr > maxDateStr) {
    return `${dateInfo} Les rendez-vous peuvent etre planifies jusqu'a ${config.max_horizon_days} jours a l'avance maximum (jusqu'au ${maxDateStr}).`;
  }

  // Generate all possible slots
  const allSlots = generateSlots(config);
  console.log(`[CheckAvailability] Generated ${allSlots.length} slots: ${allSlots.join(", ")}`);

  if (allSlots.length === 0) {
    console.log(`[CheckAvailability] No slots generated! start_time=${config.start_time}, end_time=${config.end_time}, duration=${config.slot_duration_minutes}`);
    return `${dateInfo} Aucun creneau configure pour cette date. Verifiez la configuration des horaires.`;
  }

  // If checking today, filter out past slots (accounting for min_delay)
  let availableSlots = [...allSlots];
  if (dateStr === todayStr) {
    const nowMinutesParis = toTzMinutes(now) + config.min_delay_hours * 60;
    console.log(`[CheckAvailability] Today: filtering slots before ${minutesToTime(nowMinutesParis)} (now + ${config.min_delay_hours}h delay)`);
    availableSlots = allSlots.filter((slot) => {
      const slotStart = timeToMinutes(slot.split("-")[0]);
      return slotStart >= nowMinutesParis;
    });
    console.log(`[CheckAvailability] After today filter: ${availableSlots.length} slots`);
  }

  // Load existing appointments for this date
  const { data: existingAppointments } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("user_id", config.user_id)
    .gte("start_at", `${dateStr}T00:00:00`)
    .lte("start_at", `${dateStr}T23:59:59`)
    .in("status", ["scheduled", "confirmed"]);

  console.log(`[CheckAvailability] Existing appointments: ${existingAppointments?.length || 0}`);

  // Remove booked slots (local appointments)
  if (existingAppointments && existingAppointments.length > 0) {
    const bookedTimes = new Set<string>();
    for (const appt of existingAppointments) {
      // Extract time in Paris timezone
      const apptStart = new Date(appt.start_at);
      const startTime = toTzTimeStr(apptStart);
      bookedTimes.add(startTime);
      console.log(`[CheckAvailability] Booked slot: ${startTime} (from ${appt.start_at})`);
    }
    availableSlots = availableSlots.filter((slot) => {
      const slotStartTime = slot.split("-")[0];
      return !bookedTimes.has(slotStartTime);
    });
    console.log(`[CheckAvailability] After appointments filter: ${availableSlots.length} slots`);
  }

  // Remove slots that conflict with connected calendar events (Google/Outlook)
  const calendarBusy = await getCalendarBusySlots(supabase, config.user_id, dateStr);
  if (calendarBusy.length > 0) {
    console.log(`[CheckAvailability] Calendar busy slots: ${calendarBusy.map(b => `${b.start}-${b.end}`).join(", ")}`);
    availableSlots = availableSlots.filter((slot) => {
      const slotStartMin = timeToMinutes(slot.split("-")[0]);
      const slotEndMin = timeToMinutes(slot.split("-")[1]);
      const hasConflict = calendarBusy.some((busy) => {
        const busyStartMin = timeToMinutes(busy.start);
        const busyEndMin = timeToMinutes(busy.end);
        return slotStartMin < busyEndMin && slotEndMin > busyStartMin;
      });
      return !hasConflict;
    });
    console.log(`[CheckAvailability] After calendar filter: ${availableSlots.length} slots`);
  }

  if (availableSlots.length === 0) {
    return `${dateInfo} Aucun creneau disponible le ${dateStr}. Proposez au client de choisir une autre date.`;
  }

  // Propose max 3 slots to keep it simple for the caller
  const slotsToPropose = availableSlots.slice(0, 3);
  const slotsFormatted = slotsToPropose.map((s) => s.split("-")[0]).join(", ");
  console.log(`[CheckAvailability] Returning ${slotsToPropose.length}/${availableSlots.length} available slots`);

  const moreText = availableSlots.length > 3 ? ` (${availableSlots.length - 3} autres creneaux disponibles si le client en souhaite d'autres)` : "";
  return `${dateInfo} Creneaux disponibles le ${dateStr} : ${slotsFormatted}. Chaque creneau dure ${config.slot_duration_minutes} minutes.${moreText}`;
}

async function handleBookAppointment(
  supabase: ReturnType<typeof createClient>,
  config: RdvConfig,
  params: Record<string, string>
): Promise<string> {
  const { client_name, client_phone, client_email, date, time, motif, resume } = params;

  if (!client_name || !client_phone || !date || !time) {
    return "Informations manquantes. Il faut au minimum : nom du client, telephone, date et heure.";
  }

  if (!motif) {
    return "Le motif du rendez-vous est obligatoire. Veuillez demander au client la raison de son rendez-vous.";
  }

  console.log(`[BookAppointment] Booking: ${client_name}, ${client_phone}, ${date} ${time}, motif: ${motif}`);
  if (resume) console.log(`[BookAppointment] Resume: ${resume}`);

  // Build start/end timestamps (these are Europe/Paris local times)
  const startAt = `${date}T${time}:00`;
  const endMinutes = timeToMinutes(time) + config.slot_duration_minutes;
  const endTime = minutesToTime(endMinutes);
  const endAt = `${date}T${endTime}:00`;

  // Verify slot is still available — check existing appointments
  const { data: existingAppts } = await supabase
    .from("appointments")
    .select("start_at")
    .eq("user_id", config.user_id)
    .gte("start_at", `${date}T00:00:00`)
    .lte("start_at", `${date}T23:59:59`)
    .in("status", ["scheduled", "confirmed"]);

  if (existingAppts) {
    for (const appt of existingAppts) {
      const apptTime = toTzTimeStr(new Date(appt.start_at));
      if (apptTime === time) {
        return `Ce creneau (${time}) est deja reserve le ${date}. Veuillez proposer un autre creneau.`;
      }
    }
  }

  // Find or create contact
  let contactId: string | null = null;
  const normalizedPhone = client_phone.replace(/\s/g, "");

  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("user_id", config.user_id)
    .eq("phone", normalizedPhone)
    .limit(1)
    .maybeSingle();

  if (existingContact) {
    contactId = existingContact.id;
  } else {
    const nameParts = client_name.trim().split(/\s+/);
    const firstName = nameParts[0] || client_name;
    const lastName = nameParts.slice(1).join(" ") || "";

    const { data: newContact } = await supabase
      .from("contacts")
      .insert({
        user_id: config.user_id,
        first_name: firstName,
        last_name: lastName,
        phone: normalizedPhone,
        email: client_email || null,
        source: "campaign",
      })
      .select("id")
      .single();

    if (newContact) {
      contactId = newContact.id;
    }
  }

  // Build description with resume
  const apptTitle = motif || "Rendez-vous";
  let apptDescription = `Motif: ${motif}\nClient: ${client_name}, Tel: ${client_phone}${client_email ? `, Email: ${client_email}` : ""}`;
  if (resume) {
    apptDescription += `\n\nResume de l'echange:\n${resume}`;
  }

  // Create event on connected calendar (Google/Outlook) with meeting link
  const calendarResult = await createCalendarEvent(
    supabase,
    config.user_id,
    apptTitle,
    startAt,
    endAt,
    apptDescription
  );

  const meetingLink = calendarResult.meetingLink;
  if (meetingLink) {
    console.log(`[BookAppointment] Meeting link generated: ${meetingLink}`);
  }

  const { error: apptError } = await supabase.from("appointments").insert({
    user_id: config.user_id,
    agent_id: config.agent_id,
    contact_id: contactId,
    title: apptTitle,
    description: apptDescription,
    start_at: startAt,
    end_at: endAt,
    status: "scheduled",
    location: meetingLink || "",
    external_calendar_id: calendarResult.provider,
    external_event_id: calendarResult.eventId,
  });

  if (apptError) {
    console.log(`[BookAppointment] Error: ${apptError.message}`);
    return "Erreur lors de la creation du rendez-vous. Veuillez reessayer.";
  }

  console.log(`[BookAppointment] Appointment created successfully`);

  // Build meeting link text for notifications
  const meetingLinkText = meetingLink
    ? `\nLien de reunion en ligne: ${meetingLink}`
    : "";

  // Send SMS notification if enabled
  if (config.sms_notification_enabled && normalizedPhone) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      console.log(`[BookAppointment] Sending SMS to ${normalizedPhone}...`);
      const smsContent = `Bonjour ${client_name}, votre rendez-vous est confirme pour le ${date} a ${time}. Duree: ${config.slot_duration_minutes} min. Motif: ${motif}.${meetingLinkText} A bientot !`;
      const smsRes = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          to: normalizedPhone,
          content: smsContent,
          user_id: config.user_id,
          contact_id: contactId,
        }),
      });
      const smsResult = await smsRes.json();
      console.log(`[BookAppointment] SMS result: ${smsRes.status} — ${JSON.stringify(smsResult)}`);
    } catch (err) {
      console.log(`[BookAppointment] SMS error: ${(err as Error).message}`);
    }
  }

  // Send email notification if enabled
  if (config.email_notification_enabled && client_email) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      console.log(`[BookAppointment] Sending email to ${client_email}...`);
      const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-rdv-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_id: config.user_id,
          to: client_email,
          client_name,
          date,
          time,
          duration_minutes: config.slot_duration_minutes,
          motif: motif || "Rendez-vous",
          meeting_link: meetingLink,
        }),
      });
      const emailResult = await emailRes.json();
      console.log(`[BookAppointment] Email result: ${emailRes.status} — ${JSON.stringify(emailResult)}`);
    } catch (err) {
      console.log(`[BookAppointment] Email error: ${(err as Error).message}`);
    }
  }

  // Build response for the voice agent
  let response = `Rendez-vous confirme pour ${client_name} le ${date} a ${time} (${config.slot_duration_minutes} minutes). Motif: ${motif}.`;
  if (meetingLink) {
    response += ` Un lien de reunion en ligne a ete genere: ${meetingLink}`;
  }
  if (config.sms_notification_enabled) {
    response += " Un SMS de confirmation a ete envoye.";
  }
  if (config.email_notification_enabled && client_email) {
    response += " Un email de confirmation a ete envoye.";
  }
  return response;
}

/**
 * Transfer the call to a human advisor using Twilio's Call Update API.
 * This redirects the active Twilio call to dial the target phone number.
 */
async function handleTransferCall(
  supabase: ReturnType<typeof createClient>,
  callSid: string,
  phoneNumber: string
): Promise<string> {
  if (!callSid || !phoneNumber) {
    return "Informations manquantes pour le transfert. Il faut le call_sid et le numero de telephone.";
  }

  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!twilioSid || !twilioToken) {
    console.log("[Transfer] Twilio credentials not configured");
    return "Erreur: les identifiants Twilio ne sont pas configures. Le transfert n'est pas possible.";
  }

  console.log(`[Transfer] Redirecting call ${callSid} to ${phoneNumber}`);

  try {
    const twiml = `<Response><Dial>${phoneNumber}</Dial></Response>`;
    const credentials = btoa(`${twilioSid}:${twilioToken}`);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls/${callSid}.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Twiml: twiml }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.log(`[Transfer] Twilio error: ${res.status} — ${errText}`);
      // Mark transfer as failed in DB
      await supabase
        .from("conversations")
        .update({ transferred_to: phoneNumber, transfer_status: "failed" })
        .eq("twilio_call_sid", callSid);
      return `Erreur lors du transfert: ${res.status}. Veuillez reessayer.`;
    }

    const data = await res.json();
    console.log(`[Transfer] Success — call ${data.sid} redirected to ${phoneNumber}`);

    // Mark transfer as success in DB
    await supabase
      .from("conversations")
      .update({ transferred_to: phoneNumber, transfer_status: "success" })
      .eq("twilio_call_sid", callSid);

    return `Le transfert vers ${phoneNumber} est en cours. L'appelant va etre mis en relation avec un conseiller.`;
  } catch (err) {
    console.log(`[Transfer] Error: ${(err as Error).message}`);
    // Mark transfer as failed in DB
    await supabase
      .from("conversations")
      .update({ transferred_to: phoneNumber, transfer_status: "failed" })
      .eq("twilio_call_sid", callSid);
    return "Erreur technique lors du transfert. Veuillez reessayer.";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const webhookSecret = req.headers.get("x-webhook-secret");
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: "Missing webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find config by webhook secret
    const { data: config, error: configError } = await supabase
      .from("agent_rdv_config")
      .select("*")
      .eq("webhook_secret", webhookSecret)
      .single();

    if (configError || !config) {
      console.log(`[Webhook] Config not found for secret: ${webhookSecret.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action;
    console.log(`[Webhook] Action: ${action}, body: ${JSON.stringify(body)}`);

    let result: string;

    switch (action) {
      case "check_availability":
        result = await handleCheckAvailability(supabase, config as RdvConfig, body.date);
        break;
      case "book_appointment":
        result = await handleBookAppointment(supabase, config as RdvConfig, body);
        break;
      case "transfer_call":
        result = await handleTransferCall(supabase, body.call_sid, body.phone_number);
        break;
      default:
        result = `Action inconnue: ${action}`;
    }

    console.log(`[Webhook] Result: ${result}`);
    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[Webhook] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
