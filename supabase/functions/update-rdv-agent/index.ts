import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map jour FR → label lisible
const DAY_LABELS: Record<string, string> = {
  lun: "Lundi", mar: "Mardi", mer: "Mercredi",
  jeu: "Jeudi", ven: "Vendredi", sam: "Samedi", dim: "Dimanche",
};

// Map condition key → description for ElevenLabs LLM
const CONDITION_DESCRIPTIONS: Record<string, string> = {
  "demande_conseiller": "Transfer the call when the caller explicitly asks to speak with a human advisor or counselor.",
  "probleme_non_compris": "Transfer the call when the caller mentions a problem that the bot cannot understand or handle.",
  "mot_cle_specifique": "Transfer the call when the caller uses a specific keyword indicating they need human assistance.",
  "reponse_incomprise": "Transfer the call when the caller does not understand the bot's response after multiple attempts.",
  "demande_personne_reelle": "Transfer the call when the caller insists on speaking with a real person.",
  "duree_depassee": "Transfer the call when the conversation has lasted too long without reaching a resolution.",
  "etape_critique": "Transfer the call when the conversation reaches a critical step such as payment, dispute, or complaint.",
};

function buildAvailabilityPrompt(config: Record<string, unknown>): string {
  const days = (config.working_days as string[]).map((d) => DAY_LABELS[d] || d).join(", ");
  const breaksList = (config.breaks as { start: string; end: string }[])
    .map((b) => `${b.start} - ${b.end}`)
    .join(", ");

  return `
## Base de connaissances
Si des documents ont ete fournis dans ta base de connaissances, tu DOIS les utiliser pour repondre aux questions des appelants (services proposes, tarifs, horaires, informations sur l'entreprise, etc.).
Quand un appelant pose une question sur les services, consulte ta base de connaissances et reponds de maniere complete et precise AVANT de proposer un rendez-vous.
Ne dis JAMAIS que tu ne peux pas repondre a une question si l'information est dans ta base de connaissances.

## Instructions de prise de rendez-vous
Tu es un agent specialise dans la prise de rendez-vous par telephone.
Ton role est d'aider les appelants en repondant a leurs questions et en les aidant a reserver un rendez-vous.

### IMPORTANT - Date et heure
Tu ne connais PAS la date ni l'heure actuelles. Ne devine JAMAIS la date d'aujourd'hui et ne calcule JAMAIS de date toi-meme.
Quand le client mentionne un jour (lundi, mardi, demain, etc.), passe directement ce mot a l'outil "verifier_disponibilite" (ex: "lundi", "demain", "mercredi").
Le serveur calculera automatiquement la bonne date. Tu n'as PAS besoin de convertir en format YYYY-MM-DD.
La reponse de l'outil contiendra toujours la date actuelle (format: [INFO: Aujourd'hui nous sommes le ...]).
Si le client demande quel jour on est, utilise l'outil avec "aujourd'hui" pour obtenir la date.

### Horaires de disponibilite
- Jours de travail : ${days}
- Horaires : ${config.start_time} - ${config.end_time}
- Duree des creneaux : ${config.slot_duration_minutes} minutes
${breaksList ? `- Pauses : ${breaksList}` : ""}
- Delai minimum de reservation : ${config.min_delay_hours}h a l'avance
- Planification maximale : ${config.max_horizon_days} jours a l'avance

### Processus de reservation
1. Accueille l'appelant chaleureusement
2. Reponds a ses questions en te basant sur ta base de connaissances
3. Quand il veut prendre rendez-vous, demande la date souhaitee
4. Utilise TOUJOURS l'outil "verifier_disponibilite" pour voir les creneaux libres (ne devine jamais les disponibilites)
5. Propose les creneaux disponibles au client
6. Une fois le creneau choisi, collecte les informations du client :
   - Nom complet (obligatoire)
   - Numero de telephone (obligatoire)
   - Adresse email (optionnel mais recommande)
   - Motif du rendez-vous (obligatoire - demande toujours pourquoi le client veut un rendez-vous)
7. Genere un resume concis de l'echange (les points cles discutes, les questions posees, le contexte du rendez-vous) et passe-le dans le champ "resume" de l'outil
8. Utilise l'outil "reserver_rendez_vous" pour confirmer la reservation
9. Confirme le rendez-vous au client avec un recap (date, heure, duree, motif)
10. Si un lien de reunion en ligne est retourne par l'outil, communique-le au client
11. Demande s'il a d'autres questions, sinon termine poliment l'appel

### Regles importantes
- Ne propose JAMAIS de creneaux en dehors des horaires configures
- Ne devine JAMAIS la date actuelle, utilise toujours l'outil pour l'obtenir
- Si aucun creneau n'est disponible a la date demandee, propose des dates alternatives
- Sois toujours poli, professionnel et concis
- Reponds aux questions sur les services en te basant sur la base de connaissances
`.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Authentification
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorise" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { agentId } = body;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "agentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rdvConfig = body.rdvConfig || {};

    // Find agent in DB
    const { data: agentRecord, error: agentError } = await supabase
      .from("agents")
      .select("id, elevenlabs_agent_id")
      .eq("elevenlabs_agent_id", agentId)
      .eq("user_id", user.id)
      .single();

    if (agentError || !agentRecord) {
      return new Response(JSON.stringify({ error: "Agent introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load existing RDV config to get webhook_secret
    const { data: existingConfig } = await supabase
      .from("agent_rdv_config")
      .select("*")
      .eq("agent_id", agentRecord.id)
      .single();

    const webhookSecret = existingConfig?.webhook_secret || crypto.randomUUID();

    // Build system prompt with availability instructions
    const userPrompt = body.systemPrompt || "";
    const availabilityPrompt = rdvConfig.availability_enabled !== false
      ? buildAvailabilityPrompt(rdvConfig)
      : "";

    // Build transfer instructions for the prompt
    let transferPrompt = "";
    if (rdvConfig.transfer_enabled) {
      const conditionLines = (rdvConfig.transfer_conditions || [])
        .map((c: Record<string, unknown>) => {
          const desc = CONDITION_DESCRIPTIONS[c.condition as string] || (c.condition as string);
          const phone = (c.phone as string) || rdvConfig.default_transfer_number || "";
          return `- ${desc} → Transferer vers ${phone}`;
        })
        .join("\n");

      const defaultNum = rdvConfig.default_transfer_number || "";

      transferPrompt = `
## Transfert d'appel
Tu as la possibilite de transferer l'appel vers un conseiller humain en utilisant l'outil "transferer_appel".
L'identifiant de l'appel en cours est: {{call_sid}}
Quand tu utilises l'outil "transferer_appel", passe TOUJOURS {{call_sid}} comme valeur du champ call_sid.

Tu DOIS transferer l'appel dans les cas suivants :
${conditionLines || `- Si le client demande a parler a un conseiller ou une personne reelle → Transferer vers ${defaultNum}\n- Si tu ne peux pas repondre a la question du client apres plusieurs tentatives → Transferer vers ${defaultNum}`}
${rdvConfig.always_transfer ? `\nIMPORTANT: Transfere TOUJOURS l'appel vers un conseiller humain au debut de chaque conversation. Numero: ${defaultNum}` : ""}
${defaultNum ? `\nNumero de transfert par defaut: ${defaultNum}` : ""}

### Regles de transfert
- Si le client pose une question a laquelle tu ne peux pas repondre (pas dans ta base de connaissances), propose de le transferer vers un conseiller
- Si le client est frustre ou insiste pour parler a un humain, transfere immediatement
- Avant de transferer, informe le client que tu vas le mettre en relation avec un conseiller
- Utilise l'outil "transferer_appel" avec le call_sid ({{call_sid}}) et le phone_number du conseiller
`.trim();
    }

    const fullPrompt = [userPrompt, availabilityPrompt, transferPrompt].filter(Boolean).join("\n\n");

    // Build webhook tools
    const webhookUrl = `${supabaseUrl}/functions/v1/agent-rdv-webhook`;
    const tools: Record<string, unknown>[] = [
      {
        type: "webhook",
        name: "verifier_disponibilite",
        description: "Verifie les creneaux disponibles pour un rendez-vous a une date donnee. Utilise cet outil quand le client veut prendre rendez-vous et mentionne une date. Retourne aussi la date actuelle.",
        response_timeout_secs: 20,
        disable_interruptions: true,
        force_pre_tool_speech: true,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: { "x-webhook-secret": webhookSecret },
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'check_availability'" },
              date: { type: "string", description: "Date souhaitee. Accepte: un jour de la semaine (lundi, mardi...), 'demain', 'aujourd'hui', 'cette semaine', 'semaine prochaine', ou une date YYYY-MM-DD. Le serveur calculera la date exacte." },
            },
            required: ["action", "date"],
          },
        },
      },
      {
        type: "webhook",
        name: "reserver_rendez_vous",
        description: "Reserve un creneau de rendez-vous pour le client. Utilise cet outil apres avoir confirme le creneau et collecte les informations du client (nom, telephone).",
        response_timeout_secs: 20,
        disable_interruptions: true,
        force_pre_tool_speech: true,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: { "x-webhook-secret": webhookSecret },
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'book_appointment'" },
              client_name: { type: "string", description: "Nom complet du client" },
              client_phone: { type: "string", description: "Numero de telephone du client au format international" },
              client_email: { type: "string", description: "Adresse email du client (optionnel mais recommande)" },
              date: { type: "string", description: "Date du rendez-vous au format YYYY-MM-DD" },
              time: { type: "string", description: "Heure du rendez-vous au format HH:MM" },
              motif: { type: "string", description: "Motif ou objet du rendez-vous (obligatoire - demande toujours au client)" },
              resume: { type: "string", description: "Resume concis de l'echange avec le client : points cles discutes, questions posees, contexte du rendez-vous" },
            },
            required: ["action", "client_name", "client_phone", "date", "time", "motif", "resume"],
          },
        },
      },
    ];

    // Add end_call system tool
    tools.push({
      type: "system",
      name: "end_call",
      description: "Termine l'appel poliment quand la conversation est terminee, le rendez-vous est pris, ou le client veut raccrocher.",
      params: { system_tool_type: "end_call" },
      disable_interruptions: false,
      tool_error_handling_mode: "auto",
    });

    // Add transfer tool if enabled
    if (rdvConfig.transfer_enabled) {
      tools.push({
        type: "webhook",
        name: "transferer_appel",
        description: "Transfere l'appel en cours vers un conseiller humain. Utilise cet outil quand le client demande a parler a un humain ou quand tu ne peux pas repondre a sa question.",
        response_timeout_secs: 20,
        disable_interruptions: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: { "x-webhook-secret": webhookSecret },
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'transfer_call'" },
              call_sid: { type: "string", description: "L'identifiant Twilio de l'appel en cours (fourni dans tes instructions systeme)" },
              phone_number: { type: "string", description: "Le numero de telephone vers lequel transferer l'appel au format international (ex: +33612345678)" },
            },
            required: ["action", "call_sid", "phone_number"],
          },
        },
      });
    }

    console.log(`[UpdateRdvAgent] Updating agent ${agentId}, ${tools.length} tools`);

    // PATCH ElevenLabs agent
    const patchBody = {
      name: body.name,
      conversation_config: {
        agent: {
          prompt: {
            prompt: fullPrompt,
            llm: body.llmModel || "gpt-4o-mini",
            temperature: body.temperature ?? 0.7,
            max_tokens: -1,
            tools,
          },
          first_message: body.firstMessage || "",
          language: body.language || "fr",
        },
        tts: {
          voice_id: body.voiceId,
          model_id: "eleven_turbo_v2_5",
          stability: body.stability ?? 0.5,
          similarity_boost: body.similarityBoost ?? 0.8,
          speed: body.speed ?? 1.0,
        },
        conversation: {
          max_duration_seconds: body.maxDurationSeconds ?? 600,
          text_only: false,
        },
      },
    };

    const res = await fetch(`${ELEVENLABS_API_BASE}/v1/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.log(`[UpdateRdvAgent] ElevenLabs error: ${res.status} — ${errorText}`);
      return new Response(JSON.stringify({ error: `ElevenLabs API error: ${res.status}`, details: errorText }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update agents table
    await supabase.from("agents").update({
      name: body.name,
      system_prompt: fullPrompt,
      first_message: body.firstMessage || "",
      language: body.language || "fr",
      voice_id: body.voiceId,
      llm_model: body.llmModel || "gpt-4o-mini",
      temperature: body.temperature ?? 0.7,
      stability: body.stability ?? 0.5,
      similarity_boost: body.similarityBoost ?? 0.8,
      speed: body.speed ?? 1.0,
      max_duration_seconds: body.maxDurationSeconds ?? 600,
    }).eq("id", agentRecord.id);

    // Update RDV config
    const configUpdate = {
      availability_enabled: rdvConfig.availability_enabled ?? true,
      working_days: rdvConfig.working_days || ["lun", "mar", "mer", "jeu", "ven"],
      start_time: rdvConfig.start_time || "09:00",
      end_time: rdvConfig.end_time || "17:00",
      slot_duration_minutes: rdvConfig.slot_duration_minutes || 20,
      breaks: rdvConfig.breaks || [],
      min_delay_hours: rdvConfig.min_delay_hours ?? 2,
      max_horizon_days: rdvConfig.max_horizon_days ?? 30,
      transfer_enabled: rdvConfig.transfer_enabled ?? false,
      always_transfer: rdvConfig.always_transfer ?? false,
      transfer_conditions: rdvConfig.transfer_conditions || [],
      default_transfer_number: rdvConfig.default_transfer_number || null,
      sms_notification_enabled: rdvConfig.sms_notification_enabled ?? false,
      email_notification_enabled: rdvConfig.email_notification_enabled ?? false,
      webhook_secret: webhookSecret,
    };

    if (existingConfig) {
      await supabase.from("agent_rdv_config").update(configUpdate).eq("id", existingConfig.id);
    } else {
      await supabase.from("agent_rdv_config").insert({ ...configUpdate, agent_id: agentRecord.id, user_id: user.id });
    }

    console.log(`[UpdateRdvAgent] Agent updated: ${agentId}`);

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[UpdateRdvAgent] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
