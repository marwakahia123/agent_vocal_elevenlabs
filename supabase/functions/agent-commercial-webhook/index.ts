import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CommercialConfig {
  id: string;
  agent_id: string;
  user_id: string;
  product_name: string | null;
  product_description: string | null;
  transfer_enabled: boolean;
  default_transfer_number: string | null;
  sms_enabled: boolean;
  email_enabled: boolean;
  sms_template_id: string | null;
  email_template_id: string | null;
  meeting_link: string | null;
  webhook_secret: string;
}

function replaceTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function wrapInEmailLayout(headerColor: string, title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
  <div style="background: ${headerColor}; color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 22px;">${title}</h1>
  </div>
  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
    ${bodyHtml}
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
    <p style="color: #94a3b8; font-size: 12px; text-align: center;">Ce message a ete envoye automatiquement par HallCall.</p>
  </div>
</body></html>`.trim();
}

function getCurrentDateFr(): string {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

// ========== Timezone Helpers for Europe/Paris ==========

function toTzDateStr(d: Date): string {
  return d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }); // YYYY-MM-DD
}

function toTzTimeStr(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false });
}

function toTzMinutes(d: Date): number {
  const t = toTzTimeStr(d);
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function getTzDayOfWeek(d: Date): number {
  const dayStr = d.toLocaleDateString("en-US", { timeZone: "Europe/Paris", weekday: "short" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayStr] ?? 0;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const COMMERCIAL_DAY_MAP: Record<number, string> = { 0: "dim", 1: "lun", 2: "mar", 3: "mer", 4: "jeu", 5: "ven", 6: "sam" };
const COMMERCIAL_DAY_LABELS: Record<string, string> = { lun: "lundi", mar: "mardi", mer: "mercredi", jeu: "jeudi", ven: "vendredi", sam: "samedi", dim: "dimanche" };

function resolveDate(rawDateStr: string): string {
  const now = new Date();
  const input = rawDateStr.toLowerCase().trim();
  const todayStr = toTzDateStr(now);

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  if (input === "aujourd'hui" || input === "aujourd\u2019hui" || input === "today") return todayStr;

  if (input === "demain" || input === "tomorrow") {
    const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return toTzDateStr(d);
  }

  if (input === "après-demain" || input === "apres-demain" || input === "apres demain") {
    const d = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    return toTzDateStr(d);
  }

  const dayNames: Record<string, number> = {
    lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0,
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
  };

  for (const [name, target] of Object.entries(dayNames)) {
    if (input.includes(name)) {
      const current = getTzDayOfWeek(now);
      let diff = target - current;
      if (diff <= 0) diff += 7;
      if (input.includes("prochain") || input.includes("prochaine")) {
        if (diff <= 0) diff += 7;
      }
      const d = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
      return toTzDateStr(d);
    }
  }

  if (input.includes("semaine prochaine") || input.includes("next week")) {
    const current = getTzDayOfWeek(now);
    const daysToMonday = ((1 - current + 7) % 7) || 7;
    const d = new Date(now.getTime() + daysToMonday * 24 * 60 * 60 * 1000);
    return toTzDateStr(d);
  }

  if (input.includes("cette semaine") || input.includes("this week")) {
    const current = getTzDayOfWeek(now);
    const daysToFriday = ((5 - current + 7) % 7);
    if (daysToFriday === 0) return todayStr;
    const d = new Date(now.getTime() + Math.min(daysToFriday, 1) * 24 * 60 * 60 * 1000);
    return toTzDateStr(d);
  }

  return todayStr;
}

interface AvailabilityConfig {
  working_days: string[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  breaks: { start: string; end: string }[];
  min_delay_hours: number;
  max_horizon_days: number;
  user_id: string;
}

function generateSlots(config: AvailabilityConfig): string[] {
  const startMin = timeToMinutes(config.start_time);
  const endMin = timeToMinutes(config.end_time);
  const duration = config.slot_duration_minutes;
  const slots: string[] = [];

  for (let t = startMin; t + duration <= endMin; t += duration) {
    const slotStart = minutesToTime(t);
    const slotEnd = minutesToTime(t + duration);
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

// ========== Handler: Update Contact ==========
async function handleUpdateContact(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  params: Record<string, unknown>
): Promise<string> {
  const callerPhone = params.caller_phone as string;
  const firstName = params.first_name as string | undefined;
  const lastName = params.last_name as string | undefined;
  const email = params.email as string | undefined;
  const company = params.company as string | undefined;
  const city = params.city as string | undefined;
  const notes = params.notes as string | undefined;

  if (!callerPhone) return `[INFO: Nous sommes le ${getCurrentDateFr()}] Erreur: numero de telephone requis.`;

  if (!firstName && !lastName && !email && !company && !city && !notes) {
    return `[INFO: Nous sommes le ${getCurrentDateFr()}] Erreur: aucune information a mettre a jour.`;
  }

  // Validate email if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return `[INFO: Nous sommes le ${getCurrentDateFr()}] Erreur: adresse email "${email}" invalide. Verifie le format (ex: nom@gmail.com).`;
    }
  }

  const normalizedPhone = callerPhone.replace(/[\s\-\.()]/g, "");
  console.log(`[CommercialWebhook] Updating contact for phone: ${normalizedPhone}`);

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, notes")
    .eq("user_id", userId)
    .or(`phone.eq.${normalizedPhone},phone.eq.${callerPhone}`)
    .limit(1)
    .maybeSingle();

  if (!contact) {
    return `[INFO: Nous sommes le ${getCurrentDateFr()}] Contact introuvable pour le numero ${callerPhone}.`;
  }

  // Build update object with only non-empty fields
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const updatedParts: string[] = [];

  if (firstName) { updates.first_name = firstName; updatedParts.push(`prenom: ${firstName}`); }
  if (lastName) { updates.last_name = lastName; updatedParts.push(`nom: ${lastName}`); }
  if (email) { updates.email = email; updatedParts.push(`email: ${email}`); }
  if (company) { updates.company = company; updatedParts.push(`entreprise: ${company}`); }
  if (city) { updates.city = city; updatedParts.push(`ville: ${city}`); }
  if (notes) {
    // Append notes instead of overwriting
    const existingNotes = (contact.notes as string) || "";
    updates.notes = existingNotes ? `${existingNotes}\n${notes}` : notes;
    updatedParts.push(`notes ajoutees`);
  }

  const { error } = await supabase.from("contacts").update(updates).eq("id", contact.id);
  if (error) {
    console.log(`[CommercialWebhook] Update contact error: ${error.message}`);
    return `[INFO: Nous sommes le ${getCurrentDateFr()}] Erreur lors de la mise a jour du contact.`;
  }

  console.log(`[CommercialWebhook] Contact ${contact.id} updated: ${updatedParts.join(", ")}`);
  return `[INFO: Nous sommes le ${getCurrentDateFr()}] Contact mis a jour — ${updatedParts.join(", ")}.`;
}

// ========== Handler: Search Contact ==========
async function handleSearchContact(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  query: string
): Promise<string> {
  if (!query || !query.trim()) {
    return "Veuillez fournir un numero de telephone, une adresse email ou un nom pour rechercher le contact.";
  }

  const q = query.trim();
  console.log(`[CommercialWebhook] Searching contact: "${q}"`);

  // Search by phone
  const normalizedPhone = q.replace(/\s/g, "");
  const { data: byPhone } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, company, notes, tags")
    .eq("user_id", userId)
    .eq("phone", normalizedPhone)
    .limit(1);

  if (byPhone && byPhone.length > 0) {
    return formatContactResult(byPhone[0]);
  }

  // Search by email
  if (q.includes("@")) {
    const { data: byEmail } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, email, company, notes, tags")
      .eq("user_id", userId)
      .ilike("email", q)
      .limit(1);

    if (byEmail && byEmail.length > 0) {
      return formatContactResult(byEmail[0]);
    }
  }

  // Search by name
  const { data: byName } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, company, notes, tags")
    .eq("user_id", userId)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    .limit(3);

  if (byName && byName.length > 0) {
    if (byName.length === 1) {
      return formatContactResult(byName[0]);
    }
    const list = byName.map((c: Record<string, unknown>) =>
      `- ${c.first_name} ${c.last_name} (Tel: ${c.phone || "N/A"}, Email: ${c.email || "N/A"})`
    ).join("\n");
    return `Plusieurs contacts trouves:\n${list}\nDemande au client de preciser lequel.`;
  }

  return "Aucun contact trouve avec ces informations.";
}

function formatContactResult(contact: Record<string, unknown>): string {
  let result = `[INFO: Nous sommes le ${getCurrentDateFr()}] Contact trouve:\n`;
  result += `- Nom: ${contact.first_name} ${contact.last_name}\n`;
  result += `- Telephone: ${contact.phone || "N/A"}\n`;
  result += `- Email: ${contact.email || "N/A"}\n`;
  if (contact.company) result += `- Entreprise: ${contact.company}\n`;
  if (contact.notes) result += `- Notes: ${contact.notes}\n`;
  if (contact.tags && (contact.tags as string[]).length > 0) result += `- Tags: ${(contact.tags as string[]).join(", ")}\n`;
  return result;
}

// ========== Handler: Save Qualification ==========
async function handleSaveQualification(
  supabase: ReturnType<typeof createClient>,
  config: CommercialConfig,
  params: Record<string, unknown>
): Promise<string> {
  const status = params.status as string;
  const interestLevel = params.interest_level as number | undefined;
  const notes = params.notes as string | undefined;
  const callbackDate = params.callback_date as string | undefined;
  const appointmentDate = params.appointment_date as string | undefined;
  const callerPhone = params.caller_phone as string | undefined;

  if (!status) {
    return "Le statut de qualification est obligatoire (interested, not_interested, callback, transferred, converted).";
  }

  const validStatuses = ['interested', 'not_interested', 'callback', 'transferred', 'converted'];
  if (!validStatuses.includes(status)) {
    return `Statut invalide. Valeurs acceptees: ${validStatuses.join(', ')}`;
  }

  console.log(`[CommercialWebhook] Saving qualification: status=${status}, interest=${interestLevel}, phone=${callerPhone}`);

  // Find contact by phone
  let contactId: string | null = null;
  let contactName = "";
  let contactPhone = callerPhone || "";
  let contactEmail = "";
  let contactCompany = "";

  if (callerPhone) {
    const normalizedPhone = callerPhone.replace(/\s/g, "");
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, email, company")
      .eq("user_id", config.user_id)
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    if (contact) {
      contactId = contact.id;
      contactName = `${contact.first_name} ${contact.last_name}`.trim();
      contactPhone = contact.phone || callerPhone;
      contactEmail = contact.email || "";
      contactCompany = contact.company || "";
    }
  }

  // Find the most recent active conversation for this agent
  let conversationId: string | null = null;
  const { data: agentRecord } = await supabase
    .from("agents")
    .select("elevenlabs_agent_id")
    .eq("id", config.agent_id)
    .single();

  if (agentRecord) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("elevenlabs_agent_id", agentRecord.elevenlabs_agent_id)
      .in("status", ["active", "ended"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conv) conversationId = conv.id;
  }

  // Find campaign_contact if exists
  let campaignContactId: string | null = null;
  if (conversationId) {
    const { data: cc } = await supabase
      .from("campaign_contacts")
      .select("id")
      .eq("conversation_id", conversationId)
      .limit(1)
      .maybeSingle();
    if (cc) campaignContactId = cc.id;
  }

  // Upsert lead — update existing if found by conversation_id, otherwise insert
  let leadError: { message: string } | null = null;

  // Check for existing lead (created at call initiation)
  let existingLeadId: string | null = null;
  if (conversationId) {
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("conversation_id", conversationId)
      .limit(1)
      .maybeSingle();
    if (existingLead) existingLeadId = existingLead.id;
  }
  if (!existingLeadId && campaignContactId) {
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("campaign_contact_id", campaignContactId)
      .limit(1)
      .maybeSingle();
    if (existingLead) existingLeadId = existingLead.id;
  }

  if (existingLeadId) {
    // Update existing lead
    console.log(`[CommercialWebhook] Updating existing lead ${existingLeadId}`);
    const { error } = await supabase.from("leads").update({
      status,
      interest_level: interestLevel || null,
      notes: notes || null,
      callback_date: callbackDate || null,
      appointment_date: appointmentDate || null,
      contact_id: contactId,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      contact_email: contactEmail || null,
      contact_company: contactCompany || null,
      updated_at: new Date().toISOString(),
    }).eq("id", existingLeadId);
    leadError = error;
  } else {
    // Insert new lead (browser test calls or non-campaign calls)
    console.log(`[CommercialWebhook] Inserting new lead`);
    const { error } = await supabase.from("leads").insert({
      user_id: config.user_id,
      contact_id: contactId,
      agent_id: config.agent_id,
      conversation_id: conversationId,
      campaign_contact_id: campaignContactId,
      status,
      interest_level: interestLevel || null,
      notes: notes || null,
      callback_date: callbackDate || null,
      appointment_date: appointmentDate || null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      contact_email: contactEmail || null,
      contact_company: contactCompany || null,
    });
    leadError = error;
  }

  if (leadError) {
    console.log(`[CommercialWebhook] Save qualification error: ${leadError.message}`);
    return "Erreur lors de l'enregistrement de la qualification. Veuillez reessayer.";
  }

  const statusLabels: Record<string, string> = {
    interested: "Interesse",
    not_interested: "Pas interesse",
    callback: "Rappel demande",
    transferred: "Transfere",
    converted: "Converti",
  };

  let resultMsg = `[INFO: Nous sommes le ${getCurrentDateFr()}] Qualification enregistree: ${statusLabels[status] || status}`;
  if (interestLevel) resultMsg += `, niveau d'interet: ${interestLevel}/5`;
  if (callbackDate) resultMsg += `, rappel prevu le ${callbackDate}`;
  return resultMsg;
}

// ========== Calendar Integration (same as RDV agent) ==========

const CALENDAR_TIMEZONE = "Europe/Paris";

interface CalendarEventResult {
  eventId: string | null;
  meetingLink: string | null;
  provider: string | null;
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
            start: { dateTime: startAt, timeZone: CALENDAR_TIMEZONE },
            end: { dateTime: endAt, timeZone: CALENDAR_TIMEZONE },
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
        let meetingLink: string | null = null;
        if (data.conferenceData?.entryPoints) {
          const videoEntry = data.conferenceData.entryPoints.find(
            (ep: Record<string, string>) => ep.entryPointType === "video"
          );
          meetingLink = videoEntry?.uri || null;
        }
        if (!meetingLink && data.hangoutLink) {
          meetingLink = data.hangoutLink;
        }
        console.log(`[CommercialCalendar] Google event created: ${data.id}, Meet link: ${meetingLink || "none"}`);
        return { eventId: data.id, meetingLink, provider: "google" };
      } else {
        const errorText = await res.text();
        console.log(`[CommercialCalendar] Google create error: ${res.status} — ${errorText}`);
      }
    } else {
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
            start: { dateTime: startAt, timeZone: CALENDAR_TIMEZONE },
            end: { dateTime: endAt, timeZone: CALENDAR_TIMEZONE },
            isOnlineMeeting: true,
            onlineMeetingProvider: "teamsForBusiness",
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const meetingLink = data.onlineMeeting?.joinUrl || null;
        console.log(`[CommercialCalendar] Microsoft event created: ${data.id}, Teams link: ${meetingLink || "none"}`);
        return { eventId: data.id, meetingLink, provider: "microsoft" };
      } else {
        const errorText = await res.text();
        console.log(`[CommercialCalendar] Microsoft create error: ${res.status} — ${errorText}`);
      }
    }
    return empty;
  } catch (err) {
    console.log(`[CommercialCalendar] Create event error: ${(err as Error).message}`);
    return empty;
  }
}

// ========== Handler: Book Follow-up ==========
async function handleBookFollowup(
  supabase: ReturnType<typeof createClient>,
  config: CommercialConfig,
  params: Record<string, unknown>
): Promise<string> {
  const clientName = params.client_name as string;
  const clientPhone = params.client_phone as string;
  const clientEmail = params.client_email as string | undefined;
  const date = params.date as string;
  const time = params.time as string;
  const motif = params.motif as string | undefined;

  if (!clientName || !clientPhone || !date || !time) {
    return "Informations manquantes. Il faut: nom du client, telephone, date (YYYY-MM-DD) et heure (HH:MM).";
  }

  console.log(`[CommercialWebhook] Booking follow-up: ${clientName} on ${date} at ${time}`);

  // Find or create contact
  const normalizedPhone = clientPhone.replace(/\s/g, "");
  let contactId: string | null = null;

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
    const nameParts = clientName.trim().split(/\s+/);
    const firstName = nameParts[0] || clientName;
    const lastName = nameParts.slice(1).join(" ") || "";

    const { data: newContact } = await supabase
      .from("contacts")
      .insert({
        user_id: config.user_id,
        first_name: firstName,
        last_name: lastName,
        phone: normalizedPhone,
        email: clientEmail?.trim() || null,
        source: "campaign",
      })
      .select("id")
      .single();

    if (newContact) contactId = newContact.id;
  }

  // Create appointment + calendar event with auto-generated Meet/Teams link
  const startAt = `${date}T${time}:00`;
  const endTimeStr = minutesToTime(timeToMinutes(time) + 30);
  const endAt = `${date}T${endTimeStr}:00`;

  const productLabel = config.product_name ? ` - ${config.product_name}` : "";
  const apptTitle = `RDV Commercial${productLabel}`;
  const apptDescription = `Rendez-vous commercial avec ${clientName}. Motif: ${motif || "Suivi commercial"}`;

  // Auto-create Google Calendar / Outlook event with Meet/Teams link
  const calendarResult = await createCalendarEvent(
    supabase,
    config.user_id,
    apptTitle,
    startAt,
    endAt,
    apptDescription
  );
  const meetingLink = calendarResult.meetingLink || "";
  console.log(`[CommercialWebhook] Calendar result: provider=${calendarResult.provider}, link=${meetingLink || "none"}`);

  const { error: appointmentError } = await supabase.from("appointments").insert({
    user_id: config.user_id,
    contact_id: contactId,
    agent_id: config.agent_id,
    title: apptTitle,
    description: motif || `Suivi commercial${productLabel}`,
    start_at: `${date}T${time}:00`,
    end_at: `${date}T${endTimeStr}:00`,
    status: "scheduled",
    location: meetingLink || null,
    external_calendar_id: calendarResult.provider,
    external_event_id: calendarResult.eventId,
  });

  if (appointmentError) {
    console.log(`[CommercialWebhook] Book follow-up error: ${appointmentError.message}`);
    return "Erreur lors de la reservation du rendez-vous. Veuillez reessayer.";
  }

  // Send SMS notification if enabled
  if (config.sms_enabled) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let smsContent: string;
      if (config.sms_template_id) {
        const { data: template } = await supabase
          .from("notification_templates")
          .select("*")
          .eq("id", config.sms_template_id)
          .single();

        if (template) {
          smsContent = replaceTemplateVars(template.content, {
            client_name: clientName,
            client_phone: normalizedPhone,
            client_email: clientEmail || "",
            date,
            time,
            motif: motif || "Suivi commercial",
            product_name: config.product_name || "",
            meeting_link: meetingLink,
          });
        } else {
          smsContent = `Bonjour ${clientName}, votre rendez-vous est confirme le ${date} a ${time}. A bientot !`;
        }
      } else {
        smsContent = `Bonjour ${clientName}, votre rendez-vous est confirme le ${date} a ${time}. A bientot !`;
      }

      await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
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
      console.log(`[CommercialWebhook] SMS sent to ${normalizedPhone}`);
    } catch (err) {
      console.log(`[CommercialWebhook] SMS error: ${(err as Error).message}`);
    }
  }

  // Send email notification if enabled
  if (config.email_enabled && clientEmail) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let emailSubject: string;
      let htmlBody: string;

      if (config.email_template_id) {
        const { data: template } = await supabase
          .from("notification_templates")
          .select("*")
          .eq("id", config.email_template_id)
          .single();

        if (template) {
          const vars = {
            client_name: clientName,
            client_phone: normalizedPhone,
            client_email: clientEmail,
            date,
            time,
            motif: motif || "Suivi commercial",
            product_name: config.product_name || "",
            meeting_link: meetingLink,
          };
          emailSubject = replaceTemplateVars(template.subject || "Confirmation de rendez-vous", vars);
          const renderedContent = replaceTemplateVars(template.content, vars).replace(/\n/g, "<br>");
          const meetingBtn = meetingLink
            ? `<div style="text-align:center;margin:20px 0;"><a href="${meetingLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Rejoindre la reunion en ligne</a></div>`
            : "";
          htmlBody = wrapInEmailLayout(
            template.header_color || "#0f172a",
            emailSubject,
            renderedContent + meetingBtn
          );
        } else {
          emailSubject = "Confirmation de rendez-vous commercial";
          const meetingBtn = meetingLink
            ? `<div style="text-align:center;margin:20px 0;"><a href="${meetingLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Rejoindre la reunion en ligne</a></div>`
            : "";
          htmlBody = wrapInEmailLayout("#0f172a", emailSubject,
            `<p>Bonjour <strong>${clientName}</strong>,</p>
            <p>Votre rendez-vous est confirme :</p>
            <p><strong>Date :</strong> ${date}<br><strong>Heure :</strong> ${time}</p>
            ${meetingBtn}
            <p>A bientot !</p>`);
        }
      } else {
        emailSubject = "Confirmation de rendez-vous commercial";
        const meetingBtn = meetingLink
          ? `<div style="text-align:center;margin:20px 0;"><a href="${meetingLink}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Rejoindre la reunion en ligne</a></div>`
          : "";
        htmlBody = wrapInEmailLayout("#0f172a", emailSubject,
          `<p>Bonjour <strong>${clientName}</strong>,</p>
          <p>Votre rendez-vous est confirme :</p>
          <p><strong>Date :</strong> ${date}<br><strong>Heure :</strong> ${time}</p>
          ${meetingBtn}
          <p>A bientot !</p>`);
      }

      await fetch(`${supabaseUrl}/functions/v1/send-rdv-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_id: config.user_id,
          to: clientEmail,
          client_name: clientName,
          date,
          time,
          duration_minutes: 30,
          motif: motif || "Suivi commercial",
          custom_subject: emailSubject,
          custom_body: htmlBody,
        }),
      });
      console.log(`[CommercialWebhook] Email sent to ${clientEmail}`);
    } catch (err) {
      console.log(`[CommercialWebhook] Email error: ${(err as Error).message}`);
    }
  }

  let resultMsg = `[INFO: Nous sommes le ${getCurrentDateFr()}] Rendez-vous de suivi confirme pour ${clientName} le ${date} a ${time}.`;
  if (config.sms_enabled) resultMsg += " SMS de confirmation envoye.";
  if (config.email_enabled && clientEmail) resultMsg += " Email de confirmation envoye.";
  resultMsg += " Communique la date et l'heure au client.";
  return resultMsg;
}

// ========== Handler: Send SMS ==========
async function handleSendSms(
  supabase: ReturnType<typeof createClient>,
  config: CommercialConfig,
  params: Record<string, unknown>
): Promise<string> {
  const phone = params.phone as string;
  const content = params.content as string;

  if (!phone || !content) {
    return "Numero de telephone et contenu du SMS requis.";
  }

  console.log(`[CommercialWebhook] Sending SMS to ${phone}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const normalizedPhone = phone.replace(/\s/g, "");

    // Find contact for linking
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", config.user_id)
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    const res = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        to: normalizedPhone,
        content,
        user_id: config.user_id,
        contact_id: contact?.id || null,
      }),
    });

    if (!res.ok) {
      const result = await res.json();
      console.log(`[CommercialWebhook] SMS error: ${res.status} — ${JSON.stringify(result)}`);
      return "Erreur lors de l'envoi du SMS. Veuillez reessayer.";
    }

    return `SMS envoye avec succes au ${normalizedPhone}.`;
  } catch (err) {
    console.log(`[CommercialWebhook] SMS error: ${(err as Error).message}`);
    return "Erreur technique lors de l'envoi du SMS.";
  }
}

// ========== Handler: Send Email ==========
async function handleSendEmail(
  supabase: ReturnType<typeof createClient>,
  config: CommercialConfig,
  params: Record<string, unknown>
): Promise<string> {
  const email = params.email as string;
  const subject = params.subject as string;
  const content = params.content as string;
  const clientName = params.client_name as string || "";

  if (!email || !content) {
    return "Adresse email et contenu requis.";
  }

  console.log(`[CommercialWebhook] Sending email to ${email}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const emailSubject = subject || `Information commerciale${config.product_name ? ` — ${config.product_name}` : ""}`;
    const htmlBody = wrapInEmailLayout(
      "#0f172a",
      emailSubject,
      content.replace(/\n/g, "<br>")
    );

    const res = await fetch(`${supabaseUrl}/functions/v1/send-rdv-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        user_id: config.user_id,
        to: email,
        client_name: clientName,
        date: "",
        time: "",
        duration_minutes: 0,
        motif: "",
        custom_subject: emailSubject,
        custom_body: htmlBody,
      }),
    });

    if (!res.ok) {
      const result = await res.json();
      console.log(`[CommercialWebhook] Email error: ${res.status} — ${JSON.stringify(result)}`);
      return "Erreur lors de l'envoi de l'email. Veuillez reessayer.";
    }

    return `Email envoye avec succes a ${email}.`;
  } catch (err) {
    console.log(`[CommercialWebhook] Email error: ${(err as Error).message}`);
    return "Erreur technique lors de l'envoi de l'email.";
  }
}

// ========== Handler: Check Availability ==========
async function handleCheckAvailability(
  supabase: ReturnType<typeof createClient>,
  config: AvailabilityConfig,
  rawDateStr: string
): Promise<string> {
  const now = new Date();
  const todayStr = toTzDateStr(now);
  const dateInfo = `[INFO: Nous sommes le ${getCurrentDateFr()}]`;

  const dateStr = resolveDate(rawDateStr);
  const date = new Date(dateStr + "T12:00:00");

  // Check working day
  const dateDayOfWeek = getTzDayOfWeek(date);
  const dayKey = COMMERCIAL_DAY_MAP[dateDayOfWeek];
  if (!config.working_days.includes(dayKey)) {
    const workingDaysLabels = config.working_days.map(d => COMMERCIAL_DAY_LABELS[d]).join(", ");
    return `${dateInfo} Le ${COMMERCIAL_DAY_LABELS[dayKey]} ${dateStr} n'est pas un jour de travail. Jours disponibles : ${workingDaysLabels}.`;
  }

  // Check min delay
  const minDelayMs = config.min_delay_hours * 60 * 60 * 1000;
  const minDate = new Date(now.getTime() + minDelayMs);
  const minDateStr = toTzDateStr(minDate);
  if (dateStr < minDateStr) {
    return `${dateInfo} Les rendez-vous doivent etre pris au minimum ${config.min_delay_hours}h a l'avance. Le prochain creneau possible est le ${minDateStr}.`;
  }

  // Check max horizon
  const maxDate = new Date(now.getTime() + config.max_horizon_days * 24 * 60 * 60 * 1000);
  const maxDateStr = toTzDateStr(maxDate);
  if (dateStr > maxDateStr) {
    return `${dateInfo} Les rendez-vous peuvent etre planifies jusqu'a ${config.max_horizon_days} jours a l'avance (jusqu'au ${maxDateStr}).`;
  }

  // Generate slots
  const allSlots = generateSlots(config);

  // Filter past slots if today
  let availableSlots = [...allSlots];
  if (dateStr === todayStr) {
    const nowMinutesParis = toTzMinutes(now) + config.min_delay_hours * 60;
    availableSlots = allSlots.filter((slot) => {
      const slotStart = timeToMinutes(slot.split("-")[0]);
      return slotStart >= nowMinutesParis;
    });
  }

  // Filter existing appointments
  const { data: existingAppointments } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .eq("user_id", config.user_id)
    .gte("start_at", `${dateStr}T00:00:00`)
    .lte("start_at", `${dateStr}T23:59:59`)
    .in("status", ["scheduled", "confirmed"]);

  if (existingAppointments && existingAppointments.length > 0) {
    const bookedTimes = new Set<string>();
    for (const appt of existingAppointments) {
      const apptStart = new Date(appt.start_at);
      const startTime = toTzTimeStr(apptStart);
      bookedTimes.add(startTime);
    }
    availableSlots = availableSlots.filter((slot) => {
      const slotStartTime = slot.split("-")[0];
      return !bookedTimes.has(slotStartTime);
    });
  }

  if (availableSlots.length === 0) {
    return `${dateInfo} Aucun creneau disponible le ${dateStr}. Essayez un autre jour.`;
  }

  const slotsToPropose = availableSlots.slice(0, 3);
  const slotsFormatted = slotsToPropose.map((s) => s.split("-")[0]).join(", ");
  const moreText = availableSlots.length > 3 ? ` (${availableSlots.length - 3} autres creneaux disponibles)` : "";
  return `${dateInfo} Creneaux disponibles le ${dateStr} : ${slotsFormatted}. Chaque creneau dure ${config.slot_duration_minutes} minutes.${moreText}`;
}

// ========== Handler: Transfer Call ==========
async function handleTransferCall(
  supabase: ReturnType<typeof createClient>,
  callSid: string,
  phoneNumber: string,
  agentId: string
): Promise<string> {
  if (!phoneNumber) {
    return "Informations manquantes pour le transfert. Il faut le numero de telephone.";
  }

  // Resolve call_sid — fallback to DB lookup if template variable was not resolved
  let resolvedCallSid = callSid;
  if (!resolvedCallSid || resolvedCallSid.includes("{{") || !resolvedCallSid.startsWith("CA")) {
    console.log(`[CommercialTransfer] Invalid call_sid "${callSid}", looking up from DB`);
    const { data: activeConv } = await supabase
      .from("conversations")
      .select("twilio_call_sid")
      .eq("agent_id", agentId)
      .in("status", ["active", "ended"])
      .not("twilio_call_sid", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeConv?.twilio_call_sid) {
      resolvedCallSid = activeConv.twilio_call_sid;
      console.log(`[CommercialTransfer] Resolved call_sid from DB: ${resolvedCallSid}`);
    } else {
      console.log(`[CommercialTransfer] No active conversation with twilio_call_sid found`);
      return "Impossible de determiner l'identifiant de l'appel pour le transfert.";
    }
  }

  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!twilioSid || !twilioToken) {
    console.log("[CommercialTransfer] Twilio credentials not configured");
    return "Erreur: les identifiants Twilio ne sont pas configures.";
  }

  console.log(`[CommercialTransfer] Redirecting call ${resolvedCallSid} to ${phoneNumber}`);

  try {
    const twiml = `<Response><Dial>${phoneNumber}</Dial></Response>`;
    const credentials = btoa(`${twilioSid}:${twilioToken}`);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls/${resolvedCallSid}.json`,
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
      console.log(`[CommercialTransfer] Twilio error: ${res.status} — ${errText}`);
      await supabase
        .from("conversations")
        .update({ transferred_to: phoneNumber, transfer_status: "failed" })
        .eq("twilio_call_sid", resolvedCallSid);
      return `Erreur lors du transfert: ${res.status}. Veuillez reessayer.`;
    }

    console.log(`[CommercialTransfer] Success — call redirected to ${phoneNumber}`);
    await supabase
      .from("conversations")
      .update({ transferred_to: phoneNumber, transfer_status: "success" })
      .eq("twilio_call_sid", resolvedCallSid);

    return `Le transfert vers ${phoneNumber} est en cours. L'appelant va etre mis en relation avec un conseiller.`;
  } catch (err) {
    console.log(`[CommercialTransfer] Error: ${(err as Error).message}`);
    await supabase
      .from("conversations")
      .update({ transferred_to: phoneNumber, transfer_status: "failed" })
      .eq("twilio_call_sid", resolvedCallSid);
    return "Erreur technique lors du transfert. Veuillez reessayer.";
  }
}

// ========== Main Handler ==========
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
      .from("agent_commercial_config")
      .select("*")
      .eq("webhook_secret", webhookSecret)
      .single();

    if (configError || !config) {
      console.log(`[CommercialWebhook] Config not found for secret: ${webhookSecret.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action;
    console.log(`[CommercialWebhook] Action: ${action}, body: ${JSON.stringify(body)}`);

    let result: string;

    switch (action) {
      case "search_contact":
        result = await handleSearchContact(supabase, config.user_id, body.query);
        break;
      case "update_contact":
        result = await handleUpdateContact(supabase, config.user_id, body);
        break;
      case "check_availability": {
        const availConfig: AvailabilityConfig = {
          working_days: config.working_days || ["lun", "mar", "mer", "jeu", "ven"],
          start_time: config.start_time || "09:00",
          end_time: config.end_time || "17:00",
          slot_duration_minutes: config.slot_duration_minutes || 30,
          breaks: config.breaks || [],
          min_delay_hours: config.min_delay_hours ?? 2,
          max_horizon_days: config.max_horizon_days ?? 30,
          user_id: config.user_id,
        };
        const rawDate = body.date as string;
        if (!rawDate) {
          result = `[INFO: Nous sommes le ${getCurrentDateFr()}] Veuillez preciser une date (ex: demain, lundi, 2026-03-15).`;
          break;
        }
        result = await handleCheckAvailability(supabase, availConfig, rawDate);
        break;
      }
      case "save_qualification":
        result = await handleSaveQualification(supabase, config as CommercialConfig, body);
        break;
      case "book_followup":
        result = await handleBookFollowup(supabase, config as CommercialConfig, body);
        break;
      case "send_sms":
        result = await handleSendSms(supabase, config as CommercialConfig, body);
        break;
      case "send_email":
        result = await handleSendEmail(supabase, config as CommercialConfig, body);
        break;
      case "transfer_call":
        result = await handleTransferCall(supabase, body.call_sid, body.phone_number, config.agent_id);
        break;
      default:
        result = `Action inconnue: ${action}`;
    }

    console.log(`[CommercialWebhook] Result: ${result}`);
    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[CommercialWebhook] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
