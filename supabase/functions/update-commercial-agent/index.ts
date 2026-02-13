import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

const CONDITION_DESCRIPTIONS: Record<string, string> = {
  "demande_conseiller": "Transfer the call when the caller explicitly asks to speak with a human advisor or counselor.",
  "probleme_non_compris": "Transfer the call when the caller mentions a problem that the bot cannot understand or handle.",
  "mot_cle_specifique": "Transfer the call when the caller uses a specific keyword indicating they need human assistance.",
  "reponse_incomprise": "Transfer the call when the caller does not understand the bot's response after multiple attempts.",
  "demande_personne_reelle": "Transfer the call when the caller insists on speaking with a real person.",
  "duree_depassee": "Transfer the call when the conversation has lasted too long without reaching a resolution.",
  "etape_critique": "Transfer the call when the conversation reaches a critical step such as payment, dispute, or complaint.",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAY_LABELS: Record<string, string> = {
  lun: "Lundi", mar: "Mardi", mer: "Mercredi", jeu: "Jeudi",
  ven: "Vendredi", sam: "Samedi", dim: "Dimanche",
};

function buildCommercialPrompt(userPrompt: string, config: Record<string, unknown>): string {
  const productName = (config.product_name as string) || "";
  const productDescription = (config.product_description as string) || "";
  const salesPitch = (config.sales_pitch as string) || "";
  const objectionHandling = (config.objection_handling as string) || "";
  const fillerWords = (config.filler_words as string[]) || [];
  const transferEnabled = config.transfer_enabled as boolean;
  const defaultTransferNumber = (config.default_transfer_number as string) || "";
  const alwaysTransfer = config.always_transfer as boolean;
  const transferConditions = (config.transfer_conditions as Record<string, unknown>[]) || [];
  const smsEnabled = config.sms_enabled as boolean;
  const emailEnabled = config.email_enabled as boolean;
  const availabilityEnabled = config.availability_enabled as boolean;
  const workingDays = (config.working_days as string[]) || [];
  const startTime = (config.start_time as string) || "09:00";
  const endTime = (config.end_time as string) || "17:00";
  const slotDuration = (config.slot_duration_minutes as number) || 30;
  const configBreaks = (config.breaks as { start: string; end: string }[]) || [];
  const minDelay = (config.min_delay_hours as number) ?? 2;
  const maxHorizon = (config.max_horizon_days as number) ?? 30;

  let notificationsPrompt = "";
  if (smsEnabled || emailEnabled) {
    const parts: string[] = [];
    if (smsEnabled) {
      parts.push('- Tu peux envoyer un SMS d\'information produit avec l\'outil "envoyer_sms"');
    }
    if (emailEnabled) {
      parts.push('- Tu peux envoyer un email avec les details du produit avec l\'outil "envoyer_email"');
    }
    notificationsPrompt = `
## Envoi de documentation
Si le prospect demande plus d'informations ou si tu proposes de lui envoyer de la documentation:
${parts.join("\n")}
- Demande le numero de telephone${emailEnabled ? " et/ou l'adresse email" : ""} du prospect si tu ne les as pas encore`.trim();
  }

  let transferPrompt = "";
  if (transferEnabled) {
    const conditionLines = transferConditions
      .map((c: Record<string, unknown>) => {
        const desc = CONDITION_DESCRIPTIONS[c.condition as string] || (c.condition as string);
        const phone = (c.phone as string) || defaultTransferNumber || "";
        return `- ${desc} → Transferer vers ${phone}`;
      })
      .join("\n");

    transferPrompt = `
## Transfert d'appel
Tu as la possibilite de transferer l'appel vers un conseiller commercial humain en utilisant l'outil "transferer_appel".
L'identifiant de l'appel en cours est: {{call_sid}}
Quand tu utilises l'outil "transferer_appel", passe TOUJOURS {{call_sid}} comme valeur du champ call_sid.

Tu DOIS transferer l'appel dans les cas suivants :
${conditionLines || `- Si le prospect demande a parler a un conseiller ou une personne reelle → Transferer vers ${defaultTransferNumber}\n- Si tu ne peux pas repondre a une question technique complexe → Transferer vers ${defaultTransferNumber}`}
${alwaysTransfer ? `\nIMPORTANT: Transfere TOUJOURS l'appel vers un conseiller humain au debut de chaque conversation. Numero: ${defaultTransferNumber}` : ""}
${defaultTransferNumber ? `\nNumero de transfert par defaut: ${defaultTransferNumber}` : ""}

### Regles de transfert
- Si le prospect demande explicitement a parler a un humain, transfere immediatement
- Avant de transferer, informe le prospect: "Je vais vous mettre en relation avec un de nos conseillers"
- Utilise l'outil "transferer_appel" avec le call_sid ({{call_sid}}) et le phone_number du conseiller
`.trim();
  }

  // Build filler words prompt
  let fillerWordsPrompt = "";
  if (fillerWords.length > 0) {
    fillerWordsPrompt = `
## Style de parole naturel
Pour paraitre plus naturel et humain, utilise occasionnellement ces expressions dans tes phrases :
${fillerWords.map(w => `- "${w}"`).join("\n")}
Utilise-les avec moderation (environ 1 phrase sur 3, pas a chaque phrase). Place-les en debut ou milieu de phrase, de maniere naturelle.`;
  }

  return `${userPrompt ? userPrompt + "\n\n" : ""}## Role et objectif
Tu es un agent commercial specialise dans la prospection telephonique.
Tu appelles des prospects pour presenter et proposer ${productName ? `"${productName}"` : "nos produits/services"}.
Ton objectif est de qualifier l'interet du prospect et, si possible, obtenir un rendez-vous de suivi ou un engagement.

## Date du jour
Nous sommes le {{current_date}}. Utilise TOUJOURS cette date comme reference.
Ne devine JAMAIS une date — base-toi uniquement sur {{current_date}} pour calculer "demain", "lundi prochain", etc.
Quand le client propose une date, convertis-la en format YYYY-MM-DD en te basant sur {{current_date}}.

${availabilityEnabled ? (() => {
    const daysStr = workingDays.map(d => DAY_LABELS[d] || d).join(", ");
    const breaksList = configBreaks.map(b => `  - Pause de ${b.start} a ${b.end}`).join("\n");
    return `### Horaires de disponibilite
- Jours travailles: ${daysStr}
- Horaires: ${startTime} - ${endTime}
- Duree d'un creneau: ${slotDuration} minutes
${breaksList ? `- Pauses:\n${breaksList}` : ""}
- Delai minimum avant un RDV: ${minDelay}h
- Horizon maximum de reservation: ${maxHorizon} jours

### IMPORTANT - Prise de rendez-vous
Quand un prospect souhaite un rendez-vous, tu DOIS d'abord utiliser l'outil "verifier_disponibilite" pour verifier les creneaux libres AVANT de proposer un horaire.
Ne propose JAMAIS un creneau sans avoir verifie la disponibilite.
Processus:
1. Le prospect veut un RDV → demande quel jour l'arrange
2. Utilise "verifier_disponibilite" avec le jour demande
3. Propose les creneaux disponibles retournes par l'outil
4. Une fois le creneau confirme, utilise "proposer_rendez_vous" pour reserver`;
  })() : ""}

## Contexte du contact
IMPORTANT: Tu disposes des informations suivantes sur le contact que tu appelles. Utilise-les pour personnaliser ton approche.
- Nom du contact: {{contact_name}}
- Entreprise: {{contact_company}}
- Email: {{contact_email}}
- Notes: {{contact_notes}}
- Tags: {{contact_tags}}
- Telephone: {{caller_phone}}

Si ces informations sont vides, utilise l'outil "rechercher_contact" avec {{caller_phone}} pour recuperer les donnees.

${productName || productDescription ? `## Produit / Service
${productName ? `**Nom:** ${productName}` : ""}
${productDescription ? `**Description:** ${productDescription}` : ""}` : ""}

${salesPitch ? `## Argumentaire de vente
${salesPitch}` : ""}

${objectionHandling ? `## Gestion des objections
${objectionHandling}` : ""}

## Base de connaissances
Si tu disposes d'une base de connaissances, consulte-la pour:
- Connaitre les details du produit/service
- Repondre aux questions techniques
- Avoir les tarifs et conditions
Ne dis JAMAIS que tu ne peux pas repondre si l'information est dans ta base de connaissances.

## Outils disponibles
Tu disposes des outils suivants:
1. **rechercher_contact** — Rechercher un contact par telephone, email ou nom
2. **enregistrer_qualification** — Enregistrer le resultat de la qualification du prospect (OBLIGATOIRE)
3. **proposer_rendez_vous** — Proposer et reserver un rendez-vous de suivi
${availabilityEnabled ? `4. **verifier_disponibilite** — Verifier les creneaux disponibles AVANT de proposer un rendez-vous
5. **envoyer_sms** — Envoyer un SMS d'information au prospect
6. **envoyer_email** — Envoyer un email avec les details du produit au prospect
7. **mettre_a_jour_contact** — Mettre a jour les informations du contact (email, entreprise, nom, ville, notes) si le prospect signale un changement` : `4. **envoyer_sms** — Envoyer un SMS d'information au prospect
5. **envoyer_email** — Envoyer un email avec les details du produit au prospect
6. **mettre_a_jour_contact** — Mettre a jour les informations du contact (email, entreprise, nom, ville, notes) si le prospect signale un changement`}

## Processus d'appel commercial
1. **Presentation** — Presente-toi et ton entreprise, puis verifie l'identite
   - "Bonjour {{contact_name}}, je suis [ton nom] de [entreprise]. Je m'adresse bien a {{contact_name}} ?"
   - NE DIS PAS "Comment puis-je vous aider" — c'est TOI qui proposes un service, pas le client qui demande
2. **Accroche** — Enchaine IMMEDIATEMENT avec l'accroche commerciale, par exemple:
   - "Je vous contacte car nous avons ${productName || "une solution"} qui pourrait vous interesser. Avez-vous quelques minutes ?"
3. **Presentation produit** — Presente ${productName || "le produit/service"}
4. **Ecoute** — Laisse le prospect reagir
5. **Argumentation** — Reponds aux questions et objections
6. **Qualification** — Evalue l'interet (1 a 5)
7. **Action** :
   - ${availabilityEnabled ? `**Interesse (4-5)** → Collecte l'email du prospect si tu ne l'as pas deja, puis verifie la disponibilite avec "verifier_disponibilite" AVANT de proposer un rendez-vous avec "proposer_rendez_vous"` : `Interesse (4-5) → Collecte l'email si manquant, puis propose un rendez-vous`}
   - Interesse mais pas pret (3) → Envoie documentation
   - Rappel souhaite → Note la date de rappel
   - Pas interesse (1-2) → Remercie poliment
8. **Qualification obligatoire** — UTILISE "enregistrer_qualification" avec status, interest_level, notes, caller_phone
9. **Cloture** — Termine poliment

## Collecte d'adresse email par telephone
- "arobase" ou "at" = "@", "point" = "."
- Confirme TOUJOURS l'adresse email en l'epelant

${fillerWordsPrompt}

## Regles importantes
- Ne dis JAMAIS "Comment puis-je vous aider" ou "En quoi puis-je vous aider" — tu es un agent COMMERCIAL qui appelle pour PROPOSER un service, pas un agent de support. C'est TOI qui as quelque chose a offrir.
- Apres t'etre presente et avoir verifie l'identite, enchaine DIRECTEMENT avec l'accroche commerciale. Ne pose pas de question ouverte.
- Sois poli, professionnel et enthousiaste mais pas agressif
- Ne force JAMAIS la vente
- TOUJOURS enregistrer la qualification avant de terminer l'appel
- Adapte ton discours en fonction des informations du contact
- Si le client te donne de NOUVELLES informations (email, entreprise, nom, ville) differentes de celles que tu as, utilise l'outil "mettre_a_jour_contact" pour mettre a jour sa fiche
- IMPORTANT : Avant de proposer un rendez-vous, assure-toi d'avoir collecte l'adresse email du prospect pour l'envoi de la confirmation
- Pour les questions simples ou de conversation courante, reponds directement sans utiliser d'outil. N'utilise les outils que quand c'est vraiment necessaire (reservation, recherche de contact, etc.).
- Garde tes reponses courtes et directes. Pas de longs monologues.
- Pour lire un numero de telephone, convertis le format international (+33) en format local (0) et lis les chiffres par paires. Exemple: +33667979483 se lit "zero six, soixante-sept, quatre-vingt-dix-sept, quatre-vingt-quatorze, quatre-vingt-trois". Ne dis jamais "plus trente-trois".

${notificationsPrompt}

${transferPrompt}`.trim();
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

    const commercialConfig = body.commercialConfig || {};

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

    // Load existing config to get webhook_secret
    const { data: existingConfig } = await supabase
      .from("agent_commercial_config")
      .select("*")
      .eq("agent_id", agentRecord.id)
      .single();

    const webhookSecret = existingConfig?.webhook_secret || crypto.randomUUID();

    // Build system prompt
    const userPrompt = body.systemPrompt || "";
    const fullPrompt = buildCommercialPrompt(userPrompt, commercialConfig);

    // Build webhook tools
    const webhookUrl = `${supabaseUrl}/functions/v1/agent-commercial-webhook`;
    const commonHeaders = { "x-webhook-secret": webhookSecret };

    const tools: Record<string, unknown>[] = [
      {
        type: "webhook",
        name: "rechercher_contact",
        description: "Recherche un contact dans la base de donnees par telephone, email ou nom.",
        response_timeout_secs: 8,
        disable_interruptions: false,
        force_pre_tool_speech: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'search_contact'" },
              query: { type: "string", description: "Le numero de telephone, email ou nom du contact" },
            },
            required: ["action", "query"],
          },
        },
      },
      {
        type: "webhook",
        name: "enregistrer_qualification",
        description: "Enregistre la qualification du prospect. OBLIGATOIRE avant de terminer chaque appel.",
        response_timeout_secs: 8,
        disable_interruptions: false,
        force_pre_tool_speech: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'save_qualification'" },
              status: { type: "string", description: "Statut: interested, not_interested, callback, transferred ou converted" },
              interest_level: { type: "number", description: "Niveau d'interet de 1 a 5" },
              notes: { type: "string", description: "Resume de l'echange" },
              caller_phone: { type: "string", description: "Numero de telephone du prospect" },
              callback_date: { type: "string", description: "Date de rappel au format YYYY-MM-DD (si applicable)" },
            },
            required: ["action", "status", "interest_level", "caller_phone"],
          },
        },
      },
      {
        type: "webhook",
        name: "mettre_a_jour_contact",
        description: "Met a jour les informations du contact si le prospect signale un changement (email, entreprise, nom, ville, etc.).",
        response_timeout_secs: 8,
        disable_interruptions: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'update_contact'" },
              caller_phone: { type: "string", description: "Numero de telephone actuel du contact" },
              first_name: { type: "string", description: "Nouveau prenom du contact" },
              last_name: { type: "string", description: "Nouveau nom de famille du contact" },
              email: { type: "string", description: "Nouvelle adresse email du contact" },
              company: { type: "string", description: "Nouveau nom d'entreprise du contact" },
              city: { type: "string", description: "Nouvelle ville du contact" },
              notes: { type: "string", description: "Notes supplementaires a ajouter au contact" },
            },
            required: ["action", "caller_phone"],
          },
        },
      },
      {
        type: "webhook",
        name: "proposer_rendez_vous",
        description: "Reserve un rendez-vous de suivi commercial avec le prospect.",
        response_timeout_secs: 10,
        disable_interruptions: true,
        force_pre_tool_speech: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'book_followup'" },
              client_name: { type: "string", description: "Nom complet du prospect" },
              client_phone: { type: "string", description: "Numero de telephone" },
              client_email: { type: "string", description: "Email du prospect (optionnel)" },
              date: { type: "string", description: "Date au format YYYY-MM-DD" },
              time: { type: "string", description: "Heure au format HH:MM" },
              motif: { type: "string", description: "Motif du rendez-vous" },
            },
            required: ["action", "client_name", "client_phone", "date", "time"],
          },
        },
      },
      {
        type: "webhook",
        name: "envoyer_sms",
        description: "Envoie un SMS au prospect avec des informations sur le produit/service.",
        response_timeout_secs: 8,
        disable_interruptions: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'send_sms'" },
              phone: { type: "string", description: "Numero de telephone du destinataire" },
              content: { type: "string", description: "Contenu du SMS" },
            },
            required: ["action", "phone", "content"],
          },
        },
      },
      {
        type: "webhook",
        name: "envoyer_email",
        description: "Envoie un email au prospect avec les details du produit/service.",
        response_timeout_secs: 8,
        disable_interruptions: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'send_email'" },
              email: { type: "string", description: "Adresse email du destinataire" },
              subject: { type: "string", description: "Sujet de l'email" },
              content: { type: "string", description: "Contenu de l'email" },
              client_name: { type: "string", description: "Nom du destinataire" },
            },
            required: ["action", "email", "content"],
          },
        },
      },
    ];

    // Add end_call system tool
    tools.push({
      type: "system",
      name: "end_call",
      description: "Termine l'appel poliment apres avoir enregistre la qualification.",
      params: { system_tool_type: "end_call" },
      disable_interruptions: false,
      tool_error_handling_mode: "auto",
    });

    // Add transfer tool if enabled
    if (commercialConfig.transfer_enabled) {
      tools.push({
        type: "webhook",
        name: "transferer_appel",
        description: "Transfere l'appel en cours vers un conseiller commercial humain.",
        response_timeout_secs: 10,
        disable_interruptions: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'transfer_call'" },
              call_sid: { type: "string", description: "L'identifiant Twilio de l'appel en cours" },
              phone_number: { type: "string", description: "Le numero de telephone vers lequel transferer" },
            },
            required: ["action", "call_sid", "phone_number"],
          },
        },
      });
    }

    // Add availability check tool if enabled
    if (commercialConfig.availability_enabled) {
      tools.push({
        type: "webhook",
        name: "verifier_disponibilite",
        description: "Verifie les creneaux disponibles pour un rendez-vous commercial. Utilise AVANT de proposer un rendez-vous.",
        response_timeout_secs: 10,
        disable_interruptions: false,
        force_pre_tool_speech: false,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'check_availability'" },
              date: { type: "string", description: "Date souhaitee. Accepte: jour de la semaine (lundi, mardi...), 'demain', 'aujourd'hui', 'cette semaine', 'semaine prochaine', ou une date YYYY-MM-DD. Le serveur calculera la date exacte." },
            },
            required: ["action", "date"],
          },
        },
      });
    }

    console.log(`[UpdateCommercialAgent] Updating agent ${agentId}, ${tools.length} tools`);

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
          model_id: "eleven_flash_v2_5",
          stability: body.stability ?? 0.5,
          similarity_boost: body.similarityBoost ?? 0.8,
          speed: body.speed ?? 1.0,
        },
        turn: {
          turn_eagerness: "eager",
          turn_timeout: 1,
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
      console.log(`[UpdateCommercialAgent] ElevenLabs error: ${res.status} — ${errorText}`);
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

    // Update commercial config
    const configUpdate = {
      product_name: commercialConfig.product_name || null,
      product_description: commercialConfig.product_description || null,
      sales_pitch: commercialConfig.sales_pitch || null,
      objection_handling: commercialConfig.objection_handling || null,
      filler_words: commercialConfig.filler_words || [],
      transfer_enabled: commercialConfig.transfer_enabled ?? false,
      always_transfer: commercialConfig.always_transfer ?? false,
      transfer_conditions: commercialConfig.transfer_conditions || [],
      default_transfer_number: commercialConfig.default_transfer_number || null,
      sms_enabled: commercialConfig.sms_enabled ?? false,
      email_enabled: commercialConfig.email_enabled ?? false,
      sms_template_id: commercialConfig.sms_template_id || null,
      email_template_id: commercialConfig.email_template_id || null,
      meeting_link: commercialConfig.meeting_link || null,
      availability_enabled: commercialConfig.availability_enabled ?? false,
      working_days: commercialConfig.working_days || ["lun", "mar", "mer", "jeu", "ven"],
      start_time: commercialConfig.start_time || "09:00",
      end_time: commercialConfig.end_time || "17:00",
      slot_duration_minutes: commercialConfig.slot_duration_minutes || 30,
      breaks: commercialConfig.breaks || [],
      min_delay_hours: commercialConfig.min_delay_hours ?? 2,
      max_horizon_days: commercialConfig.max_horizon_days ?? 30,
      webhook_secret: webhookSecret,
    };

    if (existingConfig) {
      await supabase.from("agent_commercial_config").update(configUpdate).eq("id", existingConfig.id);
    } else {
      await supabase.from("agent_commercial_config").insert({ ...configUpdate, agent_id: agentRecord.id, user_id: user.id });
    }

    console.log(`[UpdateCommercialAgent] Agent updated: ${agentId}`);

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[UpdateCommercialAgent] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
