import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

const DAY_LABELS: Record<string, string> = {
  lun: "Lundi", mar: "Mardi", mer: "Mercredi", jeu: "Jeudi",
  ven: "Vendredi", sam: "Samedi", dim: "Dimanche",
};

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

  // Build notifications prompt
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

  // Build transfer prompt
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

  // Build availability prompt (conditional)
  let availabilityPrompt = "";
  if (availabilityEnabled) {
    const days = workingDays.map((d: string) => DAY_LABELS[d] || d).join(", ");
    const breaksList = configBreaks.map((b: { start: string; end: string }) => `${b.start} - ${b.end}`).join(", ");
    availabilityPrompt = `
### Horaires de disponibilite
- Jours de travail : ${days}
- Horaires : ${startTime} - ${endTime}
- Duree des creneaux : ${slotDuration} minutes
${breaksList ? `- Pauses : ${breaksList}\n` : ""}- Delai minimum de reservation : ${minDelay}h a l'avance
- Planification maximale : ${maxHorizon} jours a l'avance

### IMPORTANT - Prise de rendez-vous
AVANT de proposer un rendez-vous, tu DOIS d'abord utiliser l'outil "verifier_disponibilite" pour verifier les creneaux disponibles.
Ne propose JAMAIS un horaire sans avoir verifie la disponibilite.
Quand le client mentionne un jour (lundi, mardi, demain, etc.), passe directement ce mot a l'outil "verifier_disponibilite".
Le serveur calculera automatiquement la bonne date.`;
  }

  return `${userPrompt ? userPrompt + "\n\n" : ""}## Role et objectif
Tu es un agent commercial specialise dans la prospection telephonique.
Tu appelles des prospects pour presenter et proposer ${productName ? `"${productName}"` : "nos produits/services"}.
Ton objectif est de qualifier l'interet du prospect et, si possible, obtenir un rendez-vous de suivi ou un engagement.

## Date du jour
Nous sommes le {{current_date}}. Utilise TOUJOURS cette date comme reference.
Ne devine JAMAIS une date — base-toi uniquement sur {{current_date}} pour calculer "demain", "lundi prochain", etc.
Quand le client propose une date, convertis-la en format YYYY-MM-DD en te basant sur {{current_date}}.
${availabilityPrompt}

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
1. **rechercher_contact** — Rechercher un contact par telephone, email ou nom (utilise si les infos pre-chargees sont insuffisantes)
2. **enregistrer_qualification** — Enregistrer le resultat de la qualification du prospect (OBLIGATOIRE a chaque appel)
3. **proposer_rendez_vous** — Proposer et reserver un rendez-vous de suivi si le prospect est interesse
4. **envoyer_sms** — Envoyer un SMS d'information au prospect
5. **envoyer_email** — Envoyer un email avec les details du produit au prospect
6. **mettre_a_jour_contact** — Mettre a jour les informations du contact (email, entreprise, nom, ville, notes) si le prospect signale un changement${availabilityEnabled ? `\n7. **verifier_disponibilite** — Verifier les creneaux disponibles avant de proposer un rendez-vous` : ""}

## Processus d'appel commercial
1. **Presentation** — Presente-toi et ton entreprise, puis verifie l'identite
   - "Bonjour {{contact_name}}, je suis [ton nom] de [entreprise]. Je m'adresse bien a {{contact_name}} ?"
   - NE DIS PAS "Comment puis-je vous aider" — c'est TOI qui proposes un service, pas le client qui demande
2. **Accroche** — Enchaine IMMEDIATEMENT avec l'accroche commerciale, par exemple:
   - "Je vous contacte car nous avons ${productName || "une solution"} qui pourrait vous interesser. Avez-vous quelques minutes ?"
3. **Presentation produit** — Presente ${productName || "le produit/service"} de maniere concise et percutante
4. **Ecoute** — Laisse le prospect reagir et ecoute ses besoins, questions ou objections
5. **Argumentation** — Reponds aux questions et objections avec les arguments de ton argumentaire
6. **Qualification** — Evalue l'interet du prospect sur une echelle de 1 a 5:
   - 1: Pas du tout interesse
   - 2: Peu interesse
   - 3: Interesse mais pas pret
   - 4: Interesse et ouvert
   - 5: Tres interesse, pret a s'engager
7. **Action selon le resultat** :
   - **Interesse (4-5)** → Collecte l'email du prospect si tu ne l'as pas deja, puis ${availabilityEnabled ? `verifie la disponibilite avec "verifier_disponibilite" AVANT de proposer un rendez-vous avec "proposer_rendez_vous"` : `propose un rendez-vous avec "proposer_rendez_vous"`}
   - **Interesse mais pas pret (3)** → Propose d'envoyer de la documentation par email/SMS
   - **Rappel souhaite** → Note la date de rappel souhaitee dans la qualification
   - **Pas interesse (1-2)** → Remercie poliment et termine l'appel
8. **Qualification obligatoire** — UTILISE TOUJOURS l'outil "enregistrer_qualification" avant de terminer l'appel:
   - status: interested, not_interested, callback, transferred ou converted
   - interest_level: 1 a 5
   - notes: resume de l'echange
   - caller_phone: {{caller_phone}}
   - callback_date: date de rappel si demandee (format YYYY-MM-DD)
9. **Cloture** — Termine poliment l'appel

## Collecte d'adresse email par telephone
Quand le prospect dicte son adresse email :
- "arobase" ou "at" signifie "@"
- "point" signifie "."
- Reconnais les fournisseurs courants : gmail.com, yahoo.fr, hotmail.com, outlook.com, orange.fr, free.fr, sfr.fr, icloud.com
- Confirme TOUJOURS l'adresse email en l'epelant lettre par lettre

${fillerWordsPrompt}

## Regles importantes
- Ne dis JAMAIS "Comment puis-je vous aider" ou "En quoi puis-je vous aider" — tu es un agent COMMERCIAL qui appelle pour PROPOSER un service, pas un agent de support. C'est TOI qui as quelque chose a offrir.
- Apres t'etre presente et avoir verifie l'identite, enchaine DIRECTEMENT avec l'accroche commerciale. Ne pose pas de question ouverte.
- Sois TOUJOURS poli, professionnel et enthousiaste mais pas agressif
- Ne force JAMAIS la vente — respecte le choix du prospect
- TOUJOURS enregistrer la qualification avant de terminer l'appel
- Si le prospect est occupe, propose un rappel a un moment plus opportun
- Adapte ton discours en fonction des informations du contact (entreprise, notes, tags)
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
    const commercialConfig = body.commercialConfig || {};

    // Generate webhook secret
    const webhookSecret = crypto.randomUUID();

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
        description: "Recherche un contact dans la base de donnees par telephone, email ou nom. Utilise si les infos pre-chargees sont insuffisantes.",
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
              query: { type: "string", description: "Le numero de telephone, l'adresse email ou le nom du contact a rechercher" },
            },
            required: ["action", "query"],
          },
        },
      },
      {
        type: "webhook",
        name: "enregistrer_qualification",
        description: "Enregistre la qualification du prospect (interet, statut, notes). OBLIGATOIRE avant de terminer chaque appel.",
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
              interest_level: { type: "number", description: "Niveau d'interet de 1 (pas interesse) a 5 (tres interesse)" },
              notes: { type: "string", description: "Resume de l'echange et observations" },
              caller_phone: { type: "string", description: "Numero de telephone du prospect" },
              callback_date: { type: "string", description: "Date de rappel souhaitee au format YYYY-MM-DD (si applicable)" },
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
        description: "Reserve un rendez-vous de suivi commercial avec le prospect. Utilise quand le prospect est interesse.",
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
              client_phone: { type: "string", description: "Numero de telephone au format international" },
              client_email: { type: "string", description: "Adresse email du prospect (optionnel)" },
              date: { type: "string", description: "Date du rendez-vous au format YYYY-MM-DD" },
              time: { type: "string", description: "Heure du rendez-vous au format HH:MM" },
              motif: { type: "string", description: "Motif ou sujet du rendez-vous" },
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
              content: { type: "string", description: "Contenu du SMS a envoyer" },
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
      description: "Termine l'appel poliment apres avoir enregistre la qualification du prospect.",
      params: {
        system_tool_type: "end_call",
      },
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
              call_sid: { type: "string", description: "L'identifiant Twilio de l'appel en cours (fourni dans tes instructions systeme)" },
              phone_number: { type: "string", description: "Le numero de telephone vers lequel transferer l'appel au format international" },
            },
            required: ["action", "call_sid", "phone_number"],
          },
        },
      });
      console.log(`[CreateCommercialAgent] Added webhook transfer tool`);
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
      console.log(`[CreateCommercialAgent] Added availability check tool`);
    }

    console.log(`[CreateCommercialAgent] Total tools: ${tools.length}, names: ${tools.map(t => (t as Record<string, unknown>).name).join(", ")}`);

    // Build ElevenLabs API payload
    const apiBody = {
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

    console.log(`[CreateCommercialAgent] Creating agent on ElevenLabs...`);

    // Create agent on ElevenLabs
    const res = await fetch(`${ELEVENLABS_API_BASE}/v1/convai/agents/create`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.log(`[CreateCommercialAgent] ElevenLabs error: ${res.status} — ${errorText}`);
      return new Response(JSON.stringify({ error: `ElevenLabs API error: ${res.status}`, details: errorText }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    console.log(`[CreateCommercialAgent] ElevenLabs agent created: ${data.agent_id}`);

    // Save agent to Supabase
    const { data: agentRecord, error: agentError } = await supabase.from("agents").insert({
      user_id: user.id,
      elevenlabs_agent_id: data.agent_id,
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
      agent_type: "commercial",
    }).select("id").single();

    if (agentError) {
      console.log(`[CreateCommercialAgent] DB error: ${agentError.message}`);
      return new Response(JSON.stringify({ error: "Erreur sauvegarde agent", details: agentError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save commercial config
    await supabase.from("agent_commercial_config").insert({
      agent_id: agentRecord.id,
      user_id: user.id,
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
    });

    console.log(`[CreateCommercialAgent] Config saved, agent_id: ${agentRecord.id}`);

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[CreateCommercialAgent] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
