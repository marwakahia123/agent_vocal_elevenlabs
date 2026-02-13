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

function buildSupportPrompt(userPrompt: string, config: Record<string, unknown>): string {
  const transferEnabled = config.transfer_enabled as boolean;
  const defaultTransferNumber = (config.default_transfer_number as string) || "";
  const alwaysTransfer = config.always_transfer as boolean;
  const transferConditions = (config.transfer_conditions as Record<string, unknown>[]) || [];
  const smsEnabled = config.sms_enabled as boolean;
  const emailEnabled = config.email_enabled as boolean;

  let notificationsPrompt = "";
  if (smsEnabled || emailEnabled) {
    const parts: string[] = [];
    if (smsEnabled) {
      parts.push("- Tu DOIS envoyer un SMS de confirmation au client avec l'outil \"envoyer_sms\" contenant le numero de ticket et un resume du probleme");
    }
    if (emailEnabled) {
      parts.push("- Tu DOIS envoyer un email de confirmation au client avec l'outil \"envoyer_email\" contenant le numero de ticket, le resume du probleme et les prochaines etapes");
    }
    notificationsPrompt = `
## Notifications obligatoires apres creation de ticket
REGLE: Apres CHAQUE creation de ticket SAV, tu DOIS IMMEDIATEMENT envoyer les notifications suivantes:
${parts.join("\n")}
- N'oublie JAMAIS d'envoyer ces notifications, elles sont OBLIGATOIRES
- Demande le numero de telephone${emailEnabled ? " et l'adresse email" : ""} du client si tu ne les as pas encore`.trim();
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
Tu as la possibilite de transferer l'appel vers un conseiller humain en utilisant l'outil "transferer_appel".
L'identifiant de l'appel en cours est: {{call_sid}}
Quand tu utilises l'outil "transferer_appel", passe TOUJOURS {{call_sid}} comme valeur du champ call_sid.

Tu DOIS transferer l'appel dans les cas suivants :
${conditionLines || `- Si le client demande a parler a un conseiller ou une personne reelle → Transferer vers ${defaultTransferNumber}\n- Si tu ne peux pas repondre a la question du client apres plusieurs tentatives → Transferer vers ${defaultTransferNumber}`}
${alwaysTransfer ? `\nIMPORTANT: Transfere TOUJOURS l'appel vers un conseiller humain au debut de chaque conversation. Numero: ${defaultTransferNumber}` : ""}
${defaultTransferNumber ? `\nNumero de transfert par defaut: ${defaultTransferNumber}` : ""}

### Regles de transfert
- Si le client demande explicitement a parler a un humain, transfere immediatement
- Si le probleme est critique (panne totale, perte de donnees, urgence), transfere
- Si apres 3 echanges tu n'arrives pas a resoudre le probleme, propose le transfert
- Avant de transferer, informe le client: "Je vais vous mettre en relation avec un conseiller"
- Utilise l'outil "transferer_appel" avec le call_sid ({{call_sid}}) et le phone_number du conseiller
`.trim();
  }

  return `${userPrompt ? userPrompt + "\n\n" : ""}## Role et mission
Tu es un agent de support client specialise dans le service apres-vente et l'assistance technique.
Ton role est d'aider les clients par telephone en resolvant leurs problemes, en creant des tickets SAV si necessaire, et en les orientant vers les bonnes ressources.

## Base de connaissances
Si des documents ont ete fournis dans ta base de connaissances, tu DOIS les utiliser pour repondre aux questions des clients.
REGLE CRITIQUE: Tu DOIS TOUJOURS chercher une solution dans ta base de connaissances AVANT de proposer un ticket SAV.
- Si ta KB contient une solution au probleme du client, propose-la
- Ne cree un ticket SAV que si: (1) la KB n'a aucune solution, (2) la solution proposee ne fonctionne pas, ou (3) le probleme necessite une intervention technique
- Dis au client: "Laissez-moi verifier si j'ai une solution pour vous..." avant de consulter ta KB
- Ne dis JAMAIS que tu ne peux pas repondre si l'information est dans ta base de connaissances
- Ne cree JAMAIS un ticket sans avoir d'abord (1) cherche dans la KB, (2) propose la solution au client, et (3) obtenu l'accord EXPLICITE du client pour ouvrir un ticket

## Outils disponibles
Tu disposes des outils suivants pour assister le client:
1. **rechercher_client** — Rechercher un client par telephone, email ou nom
2. **enregistrer_client** — Enregistrer un nouveau client s'il n'existe pas
3. **creer_ticket_sav** — Creer un ticket SAV (UNIQUEMENT si la KB n'a pas de solution)
4. **modifier_statut_ticket** — Modifier le statut d'un ticket existant
5. **ajouter_note_ticket** — Ajouter une note/commentaire a un ticket
6. **envoyer_sms** — Envoyer un SMS de confirmation au client
7. **envoyer_email** — Envoyer un email au client
8. **planifier_rdv** — Planifier un rendez-vous technique ou un rappel
9. **transferer_appel** — Transferer l'appel vers un conseiller humain

## Workflow obligatoire
1. **Accueil** — Accueille le client chaleureusement et avec empathie
2. **Identification** — Demande le nom ou le numero de telephone du client, puis utilise "rechercher_client" pour le retrouver
   - Si le client n'existe pas, collecte ses informations (nom, prenom, telephone, email) et utilise "enregistrer_client"
3. **Ecoute active** — Ecoute attentivement le probleme du client, reformule pour confirmer ta comprehension
4. **Recherche de solution** — AVANT de proposer un ticket, cherche une solution dans ta base de connaissances et propose-la au client
5. **Proposition de ticket** — Si la solution KB ne fonctionne pas ou n'existe pas:
   - Dis au client: "Je n'ai pas trouve de solution immediate. Souhaitez-vous que j'ouvre un ticket de support pour que notre equipe technique s'en occupe ?"
   - ATTENDS la confirmation du client (oui, d'accord, ok, etc.)
   - Ne cree JAMAIS un ticket sans l'accord explicite du client
6. **Creation du ticket** — UNIQUEMENT apres confirmation du client:
   - Cree un ticket SAV avec "creer_ticket_sav"
   - Communique le numero de ticket au client (format SAV-XXXXXXXX-XXXXX)
7. **Actions complementaires** — Apres la creation du ticket:
   - Planifie un RDV technique si necessaire
   - Transfere vers un humain si le probleme depasse tes capacites
8. **Confirmation** — Resume les actions effectuees et les prochaines etapes
9. **Cloture** — Demande si le client a d'autres questions, puis cloture poliment

## Regles d'escalade
- Transfere l'appel si le client demande explicitement un humain
- Transfere si le probleme est critique (panne, urgence, perte de donnees)
- Transfere apres 3 tentatives de resolution sans succes
- Ne modifie JAMAIS un ticket "closed" sans le rouvrir d'abord
- Ne cree PAS de ticket si la KB a une solution qui fonctionne

## Style de communication
- Sois empathique et professionnel
- Utilise un langage clair et simple
- Reformule les problemes pour montrer que tu comprends
- Donne des delais realistes
- Rassure le client sur la prise en charge de son probleme
- Pour les questions simples ou de conversation courante, reponds directement sans utiliser d'outil. N'utilise les outils que quand c'est vraiment necessaire (recherche de ticket, creation, etc.).
- Garde tes reponses courtes et directes. Pas de longs monologues.
- Pour lire un numero de telephone, convertis le format international (+33) en format local (0) et lis les chiffres par paires. Exemple: +33667979483 se lit "zero six, soixante-sept, quatre-vingt-dix-sept, quatre-vingt-quatorze, quatre-vingt-trois". Ne dis jamais "plus trente-trois".

${notificationsPrompt}

${transferPrompt}`.trim();
}

function buildTools(webhookUrl: string, webhookSecret: string, transferEnabled: boolean): Record<string, unknown>[] {
  const commonHeaders = { "x-webhook-secret": webhookSecret };
  const tools: Record<string, unknown>[] = [
    {
      type: "webhook",
      name: "rechercher_client",
      description: "Recherche un client dans la base de donnees par telephone, email ou nom. Utilise cet outil pour identifier le client au debut de l'appel.",
      response_timeout_secs: 8, disable_interruptions: false, force_pre_tool_speech: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'search_client'" }, query: { type: "string", description: "Le numero de telephone, l'adresse email ou le nom du client a rechercher" } }, required: ["action", "query"] } },
    },
    {
      type: "webhook",
      name: "enregistrer_client",
      description: "Enregistre un nouveau client dans la base de donnees. Utilise cet outil quand le client n'existe pas apres une recherche.",
      response_timeout_secs: 8, disable_interruptions: false, force_pre_tool_speech: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'register_client'" }, first_name: { type: "string", description: "Prenom du client" }, last_name: { type: "string", description: "Nom de famille du client" }, phone: { type: "string", description: "Numero de telephone au format international" }, email: { type: "string", description: "Adresse email du client (optionnel)" }, company: { type: "string", description: "Nom de l'entreprise du client (optionnel)" } }, required: ["action", "first_name", "last_name", "phone"] } },
    },
    {
      type: "webhook",
      name: "creer_ticket_sav",
      description: "Cree un ticket SAV pour le client. IMPORTANT: utilise cet outil UNIQUEMENT si ta base de connaissances n'a pas de solution au probleme du client. Tu DOIS evaluer toi-meme la priorite et la categorie en fonction de la conversation.",
      response_timeout_secs: 8, disable_interruptions: true, force_pre_tool_speech: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'create_ticket'" }, subject: { type: "string", description: "Sujet court du probleme (ex: 'Panne machine a cafe')" }, description: { type: "string", description: "Description detaillee du probleme, incluant les etapes deja tentees" }, priority: { type: "string", description: "Priorite: 'low', 'medium', 'high' ou 'urgent'" }, category: { type: "string", description: "Categorie: 'general', 'technical', 'billing', 'feature_request' ou 'bug'" }, client_phone: { type: "string", description: "Numero de telephone du client pour lier au contact" } }, required: ["action", "subject", "description", "priority", "category"] } },
    },
    {
      type: "webhook",
      name: "modifier_statut_ticket",
      description: "Modifie le statut d'un ticket SAV existant. Statuts possibles: open, in_progress, waiting, resolved, closed.",
      response_timeout_secs: 8, disable_interruptions: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'update_ticket_status'" }, case_number: { type: "string", description: "Le numero du ticket SAV (format SAV-XXXXXXXX-XXXXX)" }, new_status: { type: "string", description: "Le nouveau statut: 'open', 'in_progress', 'waiting', 'resolved' ou 'closed'" } }, required: ["action", "case_number", "new_status"] } },
    },
    {
      type: "webhook",
      name: "ajouter_note_ticket",
      description: "Ajoute une note ou un commentaire a un ticket SAV existant. Utile pour documenter les echanges avec le client.",
      response_timeout_secs: 8, disable_interruptions: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'add_ticket_note'" }, case_number: { type: "string", description: "Le numero du ticket SAV (format SAV-XXXXXXXX-XXXXX)" }, content: { type: "string", description: "Le contenu de la note a ajouter" } }, required: ["action", "case_number", "content"] } },
    },
    {
      type: "webhook",
      name: "envoyer_sms",
      description: "Envoie un SMS au client. Utilise pour confirmer un ticket, un rendez-vous ou envoyer des instructions.",
      response_timeout_secs: 8, disable_interruptions: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'send_sms'" }, phone_number: { type: "string", description: "Numero de telephone du destinataire au format international" }, message: { type: "string", description: "Le contenu du SMS a envoyer" } }, required: ["action", "phone_number", "message"] } },
    },
    {
      type: "webhook",
      name: "envoyer_email",
      description: "Envoie un email au client. Utilise pour envoyer un recapitulatif, des instructions detaillees ou une confirmation.",
      response_timeout_secs: 8, disable_interruptions: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'send_email'" }, email: { type: "string", description: "Adresse email du destinataire" }, subject: { type: "string", description: "Sujet de l'email" }, body: { type: "string", description: "Contenu de l'email" } }, required: ["action", "email", "subject", "body"] } },
    },
    {
      type: "webhook",
      name: "planifier_rdv",
      description: "Planifie un rendez-vous technique ou un rappel pour le client. Utilise quand une intervention sur site ou un rappel est necessaire.",
      response_timeout_secs: 10, disable_interruptions: true, force_pre_tool_speech: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'schedule_meeting'" }, client_name: { type: "string", description: "Nom complet du client" }, client_phone: { type: "string", description: "Numero de telephone du client" }, client_email: { type: "string", description: "Email du client (optionnel)" }, date: { type: "string", description: "Date du rendez-vous au format YYYY-MM-DD" }, time: { type: "string", description: "Heure du rendez-vous au format HH:MM" }, motif: { type: "string", description: "Motif du rendez-vous (ex: 'Intervention technique', 'Rappel client')" } }, required: ["action", "client_name", "client_phone", "date", "time", "motif"] } },
    },
  ];

  tools.push({
    type: "system",
    name: "end_call",
    description: "Termine l'appel poliment quand la conversation est terminee ou que le client veut raccrocher.",
    params: { system_tool_type: "end_call" },
    disable_interruptions: false,
    tool_error_handling_mode: "auto",
  });

  if (transferEnabled) {
    tools.push({
      type: "webhook",
      name: "transferer_appel",
      description: "Transfere l'appel en cours vers un conseiller humain. Utilise quand le client demande un humain, quand le probleme est critique, ou apres 3 tentatives de resolution sans succes.",
      response_timeout_secs: 10, disable_interruptions: false,
      api_schema: { url: webhookUrl, method: "POST", request_headers: commonHeaders, request_body_schema: { type: "object", properties: { action: { type: "string", description: "Toujours 'transfer_call'" }, call_sid: { type: "string", description: "L'identifiant Twilio de l'appel en cours (fourni dans tes instructions systeme)" }, phone_number: { type: "string", description: "Le numero de telephone vers lequel transferer l'appel au format international" } }, required: ["action", "call_sid", "phone_number"] } },
    });
  }

  return tools;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { agentId } = body;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "agentId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the agent in DB
    const { data: agentRecord, error: agentError } = await supabase
      .from("agents")
      .select("id, elevenlabs_agent_id")
      .eq("elevenlabs_agent_id", agentId)
      .eq("user_id", user.id)
      .single();

    if (agentError || !agentRecord) {
      return new Response(JSON.stringify({ error: "Agent introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load existing support config to get webhook_secret
    const { data: existingConfig } = await supabase
      .from("agent_support_config")
      .select("*")
      .eq("agent_id", agentRecord.id)
      .single();

    const webhookSecret = existingConfig?.webhook_secret || crypto.randomUUID();
    const supportConfig = body.supportConfig || {};

    // Build prompt & tools
    const userPrompt = body.systemPrompt || "";
    const fullPrompt = buildSupportPrompt(userPrompt, supportConfig);
    const webhookUrl = `${supabaseUrl}/functions/v1/agent-support-webhook`;
    const tools = buildTools(webhookUrl, webhookSecret, supportConfig.transfer_enabled ?? false);

    console.log(`[UpdateSupportAgent] Updating agent ${agentId}, ${tools.length} tools`);

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
      console.log(`[UpdateSupportAgent] ElevenLabs error: ${res.status} — ${errorText}`);
      return new Response(JSON.stringify({ error: `ElevenLabs API error: ${res.status}`, details: errorText }), {
        status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Update support config
    const configUpdate = {
      transfer_enabled: supportConfig.transfer_enabled ?? false,
      always_transfer: supportConfig.always_transfer ?? false,
      transfer_conditions: supportConfig.transfer_conditions || [],
      default_transfer_number: supportConfig.default_transfer_number || null,
      sms_enabled: supportConfig.sms_enabled ?? false,
      email_enabled: supportConfig.email_enabled ?? false,
      webhook_secret: webhookSecret,
      sms_template_id: supportConfig.sms_template_id || null,
      email_template_id: supportConfig.email_template_id || null,
    };

    if (existingConfig) {
      await supabase.from("agent_support_config").update(configUpdate).eq("id", existingConfig.id);
    } else {
      await supabase.from("agent_support_config").insert({ ...configUpdate, agent_id: agentRecord.id, user_id: user.id });
    }

    console.log(`[UpdateSupportAgent] Agent updated: ${agentId}`);

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[UpdateSupportAgent] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
