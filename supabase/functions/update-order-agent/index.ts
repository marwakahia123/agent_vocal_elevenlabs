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

function buildOrderPrompt(userPrompt: string, config: Record<string, unknown>): string {
  const transferEnabled = config.transfer_enabled as boolean;
  const defaultTransferNumber = (config.default_transfer_number as string) || "";
  const alwaysTransfer = config.always_transfer as boolean;
  const transferConditions = (config.transfer_conditions as Record<string, unknown>[]) || [];
  const smsEnabled = config.sms_enabled as boolean;
  const emailEnabled = config.email_enabled as boolean;
  const currency = (config.currency as string) || "EUR";
  const taxRate = (config.tax_rate as number) || 0;

  let notificationsPrompt = "";
  if (smsEnabled || emailEnabled) {
    const parts: string[] = [];
    if (smsEnabled) {
      parts.push('- Tu DOIS envoyer un SMS de facture au client avec l\'outil "envoyer_sms_facture" en passant le numero de commande');
    }
    if (emailEnabled) {
      parts.push('- Tu DOIS envoyer un email de facture au client avec l\'outil "envoyer_email_facture" en passant le numero de commande');
    }
    notificationsPrompt = `
## Notifications obligatoires apres validation de commande
REGLE: Apres CHAQUE validation de commande, tu DOIS IMMEDIATEMENT envoyer les notifications suivantes:
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
- Avant de transferer, informe le client: "Je vais vous mettre en relation avec un conseiller"
- Utilise l'outil "transferer_appel" avec le call_sid ({{call_sid}}) et le phone_number du conseiller
`.trim();
  }

  const taxInfo = taxRate > 0
    ? `- Taux de TVA: ${(taxRate * 100).toFixed(1)}% — applique-le au sous-total pour calculer le total TTC`
    : "- Pas de TVA a appliquer";

  return `${userPrompt ? userPrompt + "\n\n" : ""}## Role et objectif
Tu es un agent specialise dans la prise de commande par telephone.
Tu accueilles les clients chaleureusement et prends leurs commandes pour tout type de commerce (restaurant, pizzeria, boulangerie, traiteur, etc.).

## Base de connaissances
Tu DOIS consulter ta base de connaissances pour connaitre:
- Les produits/articles disponibles
- Les prix unitaires
- Les options disponibles (tailles, saveurs, extras, accompagnements)
- Les promotions ou menus en cours

REGLE CRITIQUE: Ne JAMAIS improviser ou inventer un prix. Si un produit n'est pas dans ta base de connaissances, informe le client: "Desole, je n'ai pas ce produit dans notre carte."
Ne dis JAMAIS que tu ne peux pas repondre a une question si l'information est dans ta base de connaissances.

## Parametres de commande
- Devise: ${currency}
${taxInfo}
- Format des prix: toujours avec 2 decimales (ex: 12.50 ${currency})

## Outils disponibles
Tu disposes des outils suivants:
1. **rechercher_client** — Rechercher un client par telephone, email ou nom
2. **enregistrer_client** — Enregistrer un nouveau client
3. **enregistrer_commande** — Sauvegarder la commande validee avec tous les articles
4. **envoyer_sms_facture** — Envoyer la facture par SMS au client
5. **envoyer_email_facture** — Envoyer la facture par email au client

## Processus de prise de commande
1. **Accueil** — Accueille le client chaleureusement
2. **Prise de commande** — Demande ce que le client souhaite commander
3. **Pour chaque article** :
   - Confirme le nom exact du produit en consultant ta base de connaissances
   - Verifie le prix dans ta KB
   - Demande la quantite
   - Confirme: "[quantite]x [produit] a [prix] ${currency} l'unite"
4. **Total progressif** — Annonce le sous-total au fur et a mesure
5. **Autres articles** — Demande si le client souhaite ajouter autre chose
6. **Recapitulatif** — Quand la commande est terminee:
   - Liste TOUS les articles avec quantites et prix
   - Annonce le sous-total${taxRate > 0 ? ", la TVA" : ""}
   - Annonce le TOTAL GENERAL
   - Demande confirmation: "Votre commande est de [total] ${currency}. Je vous confirme ?"
7. **Identification client** :
   - Le numero de telephone du client est {{caller_phone}}. Utilise TOUJOURS ce numero.
   - Utilise l'outil "rechercher_client" avec {{caller_phone}}
   - Si le contact existe, utilise ses informations et confirme: "J'ai bien vos coordonnees, [nom], est-ce correct ?"
   - Si le contact n'existe pas, demande: Nom complet (obligatoire), Email (optionnel)
   - Enregistre le nouveau client avec "enregistrer_client" si necessaire
8. **Validation** — Apres confirmation du client:
   - Utilise l'outil "enregistrer_commande" avec TOUS les articles (nom, quantite, prix unitaire), le nom du client, telephone et email
   - Communique le numero de commande au client (format CMD-XXXXXXXX-XXXXX)
9. **Facture** — Envoie la facture par SMS et/ou email si active
10. **Cloture** — Remercie le client et termine poliment

## Modifications de commande
- Le client peut ajouter ou retirer des articles a tout moment pendant la prise de commande
- Recalcule et annonce le nouveau total apres chaque modification
- Confirme: "D'accord, j'ai retire/ajoute [article]. Votre nouveau total est de [total] ${currency}"

## Collecte d'adresse email par telephone
Quand le client dicte son adresse email :
- "arobase" ou "at" signifie "@"
- "point" signifie "."
- Reconnais les fournisseurs courants : gmail.com, yahoo.fr, hotmail.com, outlook.com, orange.fr, free.fr, sfr.fr, icloud.com
- Confirme TOUJOURS l'adresse email en l'epelant lettre par lettre

## Regles importantes
- Ne propose JAMAIS un produit qui n'est pas dans ta base de connaissances
- Ne JAMAIS inventer un prix — consulte toujours la KB
- Sois toujours poli, professionnel et enthousiaste
- Si le client hesite, propose les produits populaires ou les promotions de ta KB

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

    const orderConfig = body.orderConfig || {};

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

    // Load existing order config to get webhook_secret
    const { data: existingConfig } = await supabase
      .from("agent_order_config")
      .select("*")
      .eq("agent_id", agentRecord.id)
      .single();

    const webhookSecret = existingConfig?.webhook_secret || crypto.randomUUID();

    // Build system prompt
    const userPrompt = body.systemPrompt || "";
    const fullPrompt = buildOrderPrompt(userPrompt, orderConfig);

    // Build webhook tools
    const webhookUrl = `${supabaseUrl}/functions/v1/agent-order-webhook`;
    const commonHeaders = { "x-webhook-secret": webhookSecret };

    const tools: Record<string, unknown>[] = [
      {
        type: "webhook",
        name: "rechercher_client",
        description: "Recherche un client dans la base de donnees par telephone, email ou nom. Utilise cet outil pour identifier le client.",
        response_timeout_secs: 15,
        disable_interruptions: true,
        force_pre_tool_speech: true,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'search_client'" },
              query: { type: "string", description: "Le numero de telephone, l'adresse email ou le nom du client a rechercher" },
            },
            required: ["action", "query"],
          },
        },
      },
      {
        type: "webhook",
        name: "enregistrer_client",
        description: "Enregistre un nouveau client dans la base de donnees. Utilise cet outil quand le client n'existe pas apres une recherche.",
        response_timeout_secs: 15,
        disable_interruptions: true,
        force_pre_tool_speech: true,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'register_client'" },
              first_name: { type: "string", description: "Prenom du client" },
              last_name: { type: "string", description: "Nom de famille du client" },
              phone: { type: "string", description: "Numero de telephone au format international" },
              email: { type: "string", description: "Adresse email du client (optionnel)" },
            },
            required: ["action", "first_name", "last_name", "phone"],
          },
        },
      },
      {
        type: "webhook",
        name: "enregistrer_commande",
        description: "Sauvegarde la commande validee dans la base de donnees. Utilise cet outil UNIQUEMENT apres que le client a confirme sa commande.",
        response_timeout_secs: 20,
        disable_interruptions: true,
        force_pre_tool_speech: true,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'save_order'" },
              client_name: { type: "string", description: "Nom complet du client" },
              client_phone: { type: "string", description: "Numero de telephone du client au format international" },
              client_email: { type: "string", description: "Adresse email du client (optionnel)" },
              items: {
                type: "array",
                description: "Liste des articles commandes",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Nom de l'article" },
                    quantity: { type: "number", description: "Quantite commandee" },
                    unit_price: { type: "number", description: "Prix unitaire" },
                  },
                  required: ["name", "quantity", "unit_price"],
                },
              },
              notes: { type: "string", description: "Notes ou instructions speciales du client (optionnel)" },
            },
            required: ["action", "client_name", "client_phone", "items"],
          },
        },
      },
      {
        type: "webhook",
        name: "envoyer_sms_facture",
        description: "Envoie un SMS au client contenant le recapitulatif de sa commande et le total.",
        response_timeout_secs: 15,
        disable_interruptions: true,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'send_sms_invoice'" },
              order_number: { type: "string", description: "Le numero de commande (format CMD-XXXXXXXX-XXXXX)" },
            },
            required: ["action", "order_number"],
          },
        },
      },
      {
        type: "webhook",
        name: "envoyer_email_facture",
        description: "Envoie un email au client contenant la facture detaillee de sa commande.",
        response_timeout_secs: 15,
        disable_interruptions: true,
        api_schema: {
          url: webhookUrl,
          method: "POST",
          request_headers: commonHeaders,
          request_body_schema: {
            type: "object",
            properties: {
              action: { type: "string", description: "Toujours 'send_email_invoice'" },
              order_number: { type: "string", description: "Le numero de commande (format CMD-XXXXXXXX-XXXXX)" },
            },
            required: ["action", "order_number"],
          },
        },
      },
    ];

    // Add end_call system tool
    tools.push({
      type: "system",
      name: "end_call",
      description: "Termine l'appel poliment quand la commande est validee et les notifications envoyees, ou que le client veut raccrocher.",
      params: { system_tool_type: "end_call" },
      disable_interruptions: false,
      tool_error_handling_mode: "auto",
    });

    // Add transfer tool if enabled
    if (orderConfig.transfer_enabled) {
      tools.push({
        type: "webhook",
        name: "transferer_appel",
        description: "Transfere l'appel en cours vers un conseiller humain.",
        response_timeout_secs: 20,
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
              phone_number: { type: "string", description: "Le numero de telephone vers lequel transferer l'appel" },
            },
            required: ["action", "call_sid", "phone_number"],
          },
        },
      });
    }

    console.log(`[UpdateOrderAgent] Updating agent ${agentId}, ${tools.length} tools`);

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
      console.log(`[UpdateOrderAgent] ElevenLabs error: ${res.status} — ${errorText}`);
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

    // Update order config
    const configUpdate = {
      transfer_enabled: orderConfig.transfer_enabled ?? false,
      always_transfer: orderConfig.always_transfer ?? false,
      transfer_conditions: orderConfig.transfer_conditions || [],
      default_transfer_number: orderConfig.default_transfer_number || null,
      sms_enabled: orderConfig.sms_enabled ?? false,
      email_enabled: orderConfig.email_enabled ?? false,
      currency: orderConfig.currency || "EUR",
      tax_rate: orderConfig.tax_rate ?? 0,
      webhook_secret: webhookSecret,
    };

    if (existingConfig) {
      await supabase.from("agent_order_config").update(configUpdate).eq("id", existingConfig.id);
    } else {
      await supabase.from("agent_order_config").insert({ ...configUpdate, agent_id: agentRecord.id, user_id: user.id });
    }

    console.log(`[UpdateOrderAgent] Agent updated: ${agentId}`);

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[UpdateOrderAgent] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
