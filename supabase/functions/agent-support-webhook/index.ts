import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SupportConfig {
  id: string;
  agent_id: string;
  user_id: string;
  transfer_enabled: boolean;
  default_transfer_number: string | null;
  sms_enabled: boolean;
  email_enabled: boolean;
  default_priority: string;
  default_category: string;
  webhook_secret: string;
  sms_template_id: string | null;
  email_template_id: string | null;
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

// ========== Handler: Search Client ==========
async function handleSearchClient(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  query: string
): Promise<string> {
  if (!query || !query.trim()) {
    return "Veuillez fournir un numero de telephone, une adresse email ou un nom pour rechercher le client.";
  }

  const q = query.trim();
  console.log(`[SupportWebhook] Searching client: "${q}"`);

  // Search by phone (exact match, with normalization)
  const normalizedPhone = q.replace(/\s/g, "");
  const { data: byPhone } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, company, tags, notes")
    .eq("user_id", userId)
    .eq("phone", normalizedPhone)
    .limit(1);

  if (byPhone && byPhone.length > 0) {
    return await formatClientResult(supabase, userId, byPhone[0]);
  }

  // Search by email (exact match)
  if (q.includes("@")) {
    const { data: byEmail } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, email, company, tags, notes")
      .eq("user_id", userId)
      .ilike("email", q)
      .limit(1);

    if (byEmail && byEmail.length > 0) {
      return await formatClientResult(supabase, userId, byEmail[0]);
    }
  }

  // Search by name (ILIKE on first_name or last_name)
  const { data: byName } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, company, tags, notes")
    .eq("user_id", userId)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    .limit(3);

  if (byName && byName.length > 0) {
    if (byName.length === 1) {
      return await formatClientResult(supabase, userId, byName[0]);
    }
    // Multiple matches
    const list = byName.map((c: Record<string, unknown>) =>
      `- ${c.first_name} ${c.last_name} (Tel: ${c.phone || "N/A"}, Email: ${c.email || "N/A"})`
    ).join("\n");
    return `Plusieurs clients trouves:\n${list}\nDemande au client de preciser lequel.`;
  }

  return "Aucun client trouve avec ces informations. Propose au client de l'enregistrer en collectant son prenom, nom, telephone et email.";
}

async function formatClientResult(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  contact: Record<string, unknown>
): Promise<string> {
  let result = `Client trouve:\n`;
  result += `- Nom: ${contact.first_name} ${contact.last_name}\n`;
  result += `- Telephone: ${contact.phone || "N/A"}\n`;
  result += `- Email: ${contact.email || "N/A"}\n`;
  if (contact.company) result += `- Entreprise: ${contact.company}\n`;
  if (contact.notes) result += `- Notes: ${contact.notes}\n`;

  // Fetch recent tickets for this contact
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("case_number, subject, status, priority, created_at")
    .eq("user_id", userId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (tickets && tickets.length > 0) {
    result += `\nTickets recents:\n`;
    for (const t of tickets) {
      result += `- ${t.case_number || `#${t.subject}`}: ${t.subject} (${t.status}, ${t.priority}) — ${new Date(t.created_at).toLocaleDateString("fr-FR")}\n`;
    }
  } else {
    result += `\nAucun ticket SAV precedent.`;
  }

  return result;
}

// ========== Handler: Register Client ==========
async function handleRegisterClient(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  params: Record<string, string>
): Promise<string> {
  const { first_name, last_name, phone, email, company } = params;

  if (!first_name || !last_name || !phone) {
    return "Informations manquantes. Il faut au minimum: prenom, nom et numero de telephone.";
  }

  const normalizedPhone = phone.replace(/\s/g, "");
  console.log(`[SupportWebhook] Registering client: ${first_name} ${last_name}, ${normalizedPhone}`);

  // Check for duplicates
  const { data: existing } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email")
    .eq("user_id", userId)
    .eq("phone", normalizedPhone)
    .limit(1);

  if (existing && existing.length > 0) {
    const c = existing[0];
    return `Ce client existe deja: ${c.first_name} ${c.last_name} (Tel: ${c.phone}, Email: ${c.email || "N/A"}).`;
  }

  const { data: newContact, error } = await supabase
    .from("contacts")
    .insert({
      user_id: userId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      phone: normalizedPhone,
      email: email?.trim() || null,
      company: company?.trim() || null,
      source: "campaign",
    })
    .select("id, first_name, last_name")
    .single();

  if (error) {
    console.log(`[SupportWebhook] Register client error: ${error.message}`);
    return "Erreur lors de l'enregistrement du client. Veuillez reessayer.";
  }

  return `Client ${newContact.first_name} ${newContact.last_name} enregistre avec succes.`;
}

// ========== Handler: Create Ticket ==========
async function handleCreateTicket(
  supabase: ReturnType<typeof createClient>,
  config: SupportConfig,
  params: Record<string, string>
): Promise<string> {
  const { subject, description, priority, category, client_phone } = params;

  if (!subject || !description) {
    return "Informations manquantes. Il faut au minimum: sujet et description du probleme.";
  }

  // Generate case number: SAV-YYYYMMDD-XXXXX
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = String(Math.floor(10000 + Math.random() * 90000));
  const caseNumber = `SAV-${dateStr}-${randomPart}`;

  console.log(`[SupportWebhook] Creating ticket: ${caseNumber}, subject: ${subject}`);

  // Find contact by phone if provided
  let contactId: string | null = null;
  if (client_phone) {
    const normalizedPhone = client_phone.replace(/\s/g, "");
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", config.user_id)
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    if (contact) {
      contactId = contact.id;
    }
  }

  const { error } = await supabase.from("support_tickets").insert({
    user_id: config.user_id,
    case_number: caseNumber,
    contact_id: contactId,
    subject: subject.trim(),
    description: description.trim(),
    status: "open",
    priority: priority || config.default_priority || "medium",
    category: category || config.default_category || "general",
  });

  if (error) {
    console.log(`[SupportWebhook] Create ticket error: ${error.message}`);
    return "Erreur lors de la creation du ticket. Veuillez reessayer.";
  }

  return `Ticket SAV cree avec succes. Numero de dossier: ${caseNumber}. Communique ce numero au client pour le suivi.`;
}

// ========== Handler: Update Ticket Status ==========
async function handleUpdateTicketStatus(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  caseNumber: string,
  newStatus: string
): Promise<string> {
  if (!caseNumber || !newStatus) {
    return "Informations manquantes. Il faut le numero du ticket et le nouveau statut.";
  }

  const validStatuses = ["open", "in_progress", "waiting", "resolved", "closed"];
  if (!validStatuses.includes(newStatus)) {
    return `Statut invalide. Les statuts possibles sont: ${validStatuses.join(", ")}.`;
  }

  console.log(`[SupportWebhook] Updating ticket ${caseNumber} to status: ${newStatus}`);

  const { data: ticket, error: findError } = await supabase
    .from("support_tickets")
    .select("id, status")
    .eq("user_id", userId)
    .eq("case_number", caseNumber)
    .maybeSingle();

  if (findError || !ticket) {
    return `Ticket ${caseNumber} non trouve. Verifiez le numero du ticket.`;
  }

  const { error } = await supabase
    .from("support_tickets")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", ticket.id);

  if (error) {
    console.log(`[SupportWebhook] Update ticket error: ${error.message}`);
    return "Erreur lors de la mise a jour du ticket. Veuillez reessayer.";
  }

  return `Ticket ${caseNumber} mis a jour: statut change de "${ticket.status}" a "${newStatus}".`;
}

// ========== Handler: Add Ticket Note ==========
async function handleAddTicketNote(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  caseNumber: string,
  content: string
): Promise<string> {
  if (!caseNumber || !content) {
    return "Informations manquantes. Il faut le numero du ticket et le contenu de la note.";
  }

  console.log(`[SupportWebhook] Adding note to ticket ${caseNumber}`);

  const { data: ticket, error: findError } = await supabase
    .from("support_tickets")
    .select("id")
    .eq("user_id", userId)
    .eq("case_number", caseNumber)
    .maybeSingle();

  if (findError || !ticket) {
    return `Ticket ${caseNumber} non trouve. Verifiez le numero du ticket.`;
  }

  const { error } = await supabase.from("ticket_comments").insert({
    ticket_id: ticket.id,
    user_id: userId,
    content: content.trim(),
    is_internal: false,
  });

  if (error) {
    console.log(`[SupportWebhook] Add note error: ${error.message}`);
    return "Erreur lors de l'ajout de la note. Veuillez reessayer.";
  }

  return `Note ajoutee au ticket ${caseNumber} avec succes.`;
}

// ========== Handler: Send SMS ==========
async function handleSendSms(
  supabase: ReturnType<typeof createClient>,
  config: SupportConfig,
  phoneNumber: string,
  message: string
): Promise<string> {
  if (!phoneNumber || !message) {
    return "Informations manquantes. Il faut le numero de telephone et le message.";
  }

  console.log(`[SupportWebhook] Sending SMS to ${phoneNumber}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Find contact for logging and template vars
    const normalizedPhone = phoneNumber.replace(/\s/g, "");
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, email")
      .eq("user_id", config.user_id)
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    // Determine SMS content: use template if configured, otherwise use message directly
    let smsContent = message;

    if (config.sms_template_id) {
      const { data: template } = await supabase
        .from("notification_templates")
        .select("content")
        .eq("id", config.sms_template_id)
        .maybeSingle();

      if (template?.content) {
        const clientName = contact
          ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
          : "";

        // Look up most recent ticket for this contact
        let ticketNumber = "";
        if (contact?.id) {
          const { data: recentTicket } = await supabase
            .from("support_tickets")
            .select("case_number")
            .eq("user_id", config.user_id)
            .eq("contact_id", contact.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (recentTicket) ticketNumber = recentTicket.case_number;
        }
        if (!ticketNumber) {
          const match = message.match(/SAV-\d{8}-\d{5}/);
          if (match) ticketNumber = match[0];
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString("fr-FR", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });

        const vars: Record<string, string> = {
          client_name: clientName,
          client_phone: normalizedPhone,
          client_email: contact?.email || "",
          ticket_number: ticketNumber,
          date: dateStr,
          subject: "",
          message: message,
        };
        smsContent = replaceTemplateVars(template.content, vars);
        console.log(`[SupportWebhook] SMS using template ${config.sms_template_id}`);
      }
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        to: normalizedPhone,
        content: smsContent,
        user_id: config.user_id,
        contact_id: contact?.id || null,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.log(`[SupportWebhook] SMS error: ${res.status} — ${JSON.stringify(result)}`);
      return "Erreur lors de l'envoi du SMS. Veuillez reessayer.";
    }

    return `SMS envoye avec succes au ${phoneNumber}.`;
  } catch (err) {
    console.log(`[SupportWebhook] SMS error: ${(err as Error).message}`);
    return "Erreur technique lors de l'envoi du SMS.";
  }
}

// ========== Handler: Send Email ==========
async function handleSendEmail(
  supabase: ReturnType<typeof createClient>,
  config: SupportConfig,
  email: string,
  subject: string,
  body: string
): Promise<string> {
  if (!email || !subject || !body) {
    return "Informations manquantes. Il faut l'adresse email, le sujet et le contenu.";
  }

  console.log(`[SupportWebhook] Sending email to ${email}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Determine email subject and body: use template if configured, otherwise use params directly
    let customSubject = subject;
    let customBody = body;

    if (config.email_template_id) {
      const { data: template } = await supabase
        .from("notification_templates")
        .select("subject, content, header_color")
        .eq("id", config.email_template_id)
        .maybeSingle();

      if (template) {
        // Try to find the contact by email to enrich template vars
        let contactData: Record<string, unknown> | null = null;
        const { data: contactByEmail } = await supabase
          .from("contacts")
          .select("id, first_name, last_name, phone, email")
          .eq("user_id", config.user_id)
          .ilike("email", email)
          .limit(1)
          .maybeSingle();
        contactData = contactByEmail;

        // Fallback: if contact not found by email, try via ticket's contact_id
        if (!contactData) {
          const bodyMatch = body.match(/SAV-\d{8}-\d{5}/);
          if (bodyMatch) {
            const { data: ticket } = await supabase
              .from("support_tickets")
              .select("contact_id")
              .eq("user_id", config.user_id)
              .eq("case_number", bodyMatch[0])
              .maybeSingle();
            if (ticket?.contact_id) {
              const { data: fallbackContact } = await supabase
                .from("contacts")
                .select("id, first_name, last_name, phone, email")
                .eq("id", ticket.contact_id)
                .maybeSingle();
              if (fallbackContact) contactData = fallbackContact;
            }
          }
        }

        const clientName = contactData
          ? `${contactData.first_name || ""} ${contactData.last_name || ""}`.trim()
          : "";

        // Look up most recent ticket for this contact to get case_number
        let ticketNumber = "";
        if (contactData?.id) {
          const { data: recentTicket } = await supabase
            .from("support_tickets")
            .select("case_number")
            .eq("user_id", config.user_id)
            .eq("contact_id", contactData.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (recentTicket) ticketNumber = recentTicket.case_number;
        }
        // Fallback: extract SAV-XXXXXXXX-XXXXX from body text
        if (!ticketNumber) {
          const match = body.match(/SAV-\d{8}-\d{5}/);
          if (match) ticketNumber = match[0];
        }

        // Current date formatted in French
        const now = new Date();
        const dateStr = now.toLocaleDateString("fr-FR", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });

        const vars: Record<string, string> = {
          client_name: clientName,
          client_phone: (contactData?.phone as string) || "",
          client_email: email,
          ticket_number: ticketNumber,
          date: dateStr,
          subject: subject,
          message: body,
        };

        if (template.subject) {
          customSubject = replaceTemplateVars(template.subject, vars);
        }
        if (template.content) {
          const renderedContent = replaceTemplateVars(template.content, vars)
            .replace(/\n/g, "<br>");
          const tplHeaderColor = template.header_color || "#0f172a";
          customBody = wrapInEmailLayout(
            tplHeaderColor,
            customSubject || subject,
            renderedContent
          );
        }
        console.log(`[SupportWebhook] Email using template ${config.email_template_id} (header: ${template.header_color || "#0f172a"})`);
      }
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send-rdv-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        user_id: config.user_id,
        to: email,
        client_name: "",
        date: "",
        time: "",
        duration_minutes: 0,
        motif: customSubject,
        custom_subject: customSubject,
        custom_body: customBody,
      }),
    });

    if (!res.ok) {
      const result = await res.json();
      console.log(`[SupportWebhook] Email error: ${res.status} — ${JSON.stringify(result)}`);
      return "Erreur lors de l'envoi de l'email. Veuillez reessayer.";
    }

    return `Email envoye avec succes a ${email}.`;
  } catch (err) {
    console.log(`[SupportWebhook] Email error: ${(err as Error).message}`);
    return "Erreur technique lors de l'envoi de l'email.";
  }
}

// ========== Handler: Schedule Meeting ==========
async function handleScheduleMeeting(
  supabase: ReturnType<typeof createClient>,
  config: SupportConfig,
  params: Record<string, string>
): Promise<string> {
  const { client_name, client_phone, client_email, date, time, motif } = params;

  if (!client_name || !client_phone || !date || !time || !motif) {
    return "Informations manquantes. Il faut: nom du client, telephone, date, heure et motif.";
  }

  console.log(`[SupportWebhook] Scheduling meeting: ${client_name}, ${date} ${time}, motif: ${motif}`);

  // Find or create contact
  const normalizedPhone = client_phone.replace(/\s/g, "");
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

    if (newContact) contactId = newContact.id;
  }

  // Build start/end timestamps
  const startAt = `${date}T${time}:00`;
  // Default 30-minute meetings for support
  const [h, m] = time.split(":").map(Number);
  const endMinutes = h * 60 + m + 30;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  const endAt = `${date}T${endTime}:00`;

  const { error } = await supabase.from("appointments").insert({
    user_id: config.user_id,
    agent_id: config.agent_id,
    contact_id: contactId,
    title: motif,
    description: `Support: ${motif}\nClient: ${client_name}, Tel: ${client_phone}${client_email ? `, Email: ${client_email}` : ""}`,
    start_at: startAt,
    end_at: endAt,
    status: "scheduled",
  });

  if (error) {
    console.log(`[SupportWebhook] Schedule meeting error: ${error.message}`);
    return "Erreur lors de la planification du rendez-vous. Veuillez reessayer.";
  }

  return `Rendez-vous planifie avec succes pour ${client_name} le ${date} a ${time} (30 minutes). Motif: ${motif}.`;
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
    console.log(`[SupportTransfer] Invalid call_sid "${callSid}", looking up from DB`);
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
      console.log(`[SupportTransfer] Resolved call_sid from DB: ${resolvedCallSid}`);
    } else {
      console.log(`[SupportTransfer] No active conversation with twilio_call_sid found`);
      return "Impossible de determiner l'identifiant de l'appel pour le transfert.";
    }
  }

  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!twilioSid || !twilioToken) {
    console.log("[SupportTransfer] Twilio credentials not configured");
    return "Erreur: les identifiants Twilio ne sont pas configures.";
  }

  console.log(`[SupportTransfer] Redirecting call ${resolvedCallSid} to ${phoneNumber}`);

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
      console.log(`[SupportTransfer] Twilio error: ${res.status} — ${errText}`);
      await supabase
        .from("conversations")
        .update({ transferred_to: phoneNumber, transfer_status: "failed" })
        .eq("twilio_call_sid", resolvedCallSid);
      return `Erreur lors du transfert: ${res.status}. Veuillez reessayer.`;
    }

    console.log(`[SupportTransfer] Success — call redirected to ${phoneNumber}`);
    await supabase
      .from("conversations")
      .update({ transferred_to: phoneNumber, transfer_status: "success" })
      .eq("twilio_call_sid", resolvedCallSid);

    return `Le transfert vers ${phoneNumber} est en cours. L'appelant va etre mis en relation avec un conseiller.`;
  } catch (err) {
    console.log(`[SupportTransfer] Error: ${(err as Error).message}`);
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
      .from("agent_support_config")
      .select("*")
      .eq("webhook_secret", webhookSecret)
      .single();

    if (configError || !config) {
      console.log(`[SupportWebhook] Config not found for secret: ${webhookSecret.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action;
    console.log(`[SupportWebhook] Action: ${action}, body: ${JSON.stringify(body)}`);

    let result: string;

    switch (action) {
      case "search_client":
        result = await handleSearchClient(supabase, config.user_id, body.query);
        break;
      case "register_client":
        result = await handleRegisterClient(supabase, config.user_id, body);
        break;
      case "create_ticket":
        result = await handleCreateTicket(supabase, config as SupportConfig, body);
        break;
      case "update_ticket_status":
        result = await handleUpdateTicketStatus(supabase, config.user_id, body.case_number, body.new_status);
        break;
      case "add_ticket_note":
        result = await handleAddTicketNote(supabase, config.user_id, body.case_number, body.content);
        break;
      case "send_sms":
        result = await handleSendSms(supabase, config as SupportConfig, body.phone_number, body.message);
        break;
      case "send_email":
        result = await handleSendEmail(supabase, config as SupportConfig, body.email, body.subject, body.body);
        break;
      case "schedule_meeting":
        result = await handleScheduleMeeting(supabase, config as SupportConfig, body);
        break;
      case "transfer_call":
        result = await handleTransferCall(supabase, body.call_sid, body.phone_number, config.agent_id);
        break;
      default:
        result = `Action inconnue: ${action}`;
    }

    console.log(`[SupportWebhook] Result: ${result}`);
    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[SupportWebhook] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
