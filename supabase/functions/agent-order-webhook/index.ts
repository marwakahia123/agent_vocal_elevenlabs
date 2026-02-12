import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OrderConfig {
  id: string;
  agent_id: string;
  user_id: string;
  transfer_enabled: boolean;
  default_transfer_number: string | null;
  sms_enabled: boolean;
  email_enabled: boolean;
  currency: string;
  tax_rate: number;
  webhook_secret: string;
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
  console.log(`[OrderWebhook] Searching client: "${q}"`);

  // Search by phone
  const normalizedPhone = q.replace(/\s/g, "");
  const { data: byPhone } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, company, notes")
    .eq("user_id", userId)
    .eq("phone", normalizedPhone)
    .limit(1);

  if (byPhone && byPhone.length > 0) {
    return await formatClientResult(supabase, userId, byPhone[0]);
  }

  // Search by email
  if (q.includes("@")) {
    const { data: byEmail } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, email, company, notes")
      .eq("user_id", userId)
      .ilike("email", q)
      .limit(1);

    if (byEmail && byEmail.length > 0) {
      return await formatClientResult(supabase, userId, byEmail[0]);
    }
  }

  // Search by name
  const { data: byName } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, company, notes")
    .eq("user_id", userId)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    .limit(3);

  if (byName && byName.length > 0) {
    if (byName.length === 1) {
      return await formatClientResult(supabase, userId, byName[0]);
    }
    const list = byName.map((c: Record<string, unknown>) =>
      `- ${c.first_name} ${c.last_name} (Tel: ${c.phone || "N/A"}, Email: ${c.email || "N/A"})`
    ).join("\n");
    return `Plusieurs clients trouves:\n${list}\nDemande au client de preciser lequel.`;
  }

  return "Aucun client trouve avec ces informations. Propose au client de l'enregistrer en collectant son prenom, nom et telephone.";
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

  // Fetch recent orders
  const { data: orders } = await supabase
    .from("orders")
    .select("order_number, total_amount, currency, status, created_at")
    .eq("user_id", userId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(3);

  if (orders && orders.length > 0) {
    result += `\nCommandes recentes:\n`;
    for (const o of orders) {
      result += `- ${o.order_number}: ${o.total_amount.toFixed(2)} ${o.currency} (${o.status}) — ${new Date(o.created_at).toLocaleDateString("fr-FR")}\n`;
    }
  }

  return result;
}

// ========== Handler: Register Client ==========
async function handleRegisterClient(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  params: Record<string, string>
): Promise<string> {
  const { first_name, last_name, phone, email } = params;

  if (!first_name || !last_name || !phone) {
    return "Informations manquantes. Il faut au minimum: prenom, nom et numero de telephone.";
  }

  const normalizedPhone = phone.replace(/\s/g, "");
  console.log(`[OrderWebhook] Registering client: ${first_name} ${last_name}, ${normalizedPhone}`);

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
      source: "campaign",
    })
    .select("id, first_name, last_name")
    .single();

  if (error) {
    console.log(`[OrderWebhook] Register client error: ${error.message}`);
    return "Erreur lors de l'enregistrement du client. Veuillez reessayer.";
  }

  return `Client ${newContact.first_name} ${newContact.last_name} enregistre avec succes.`;
}

// ========== Handler: Save Order ==========
async function handleSaveOrder(
  supabase: ReturnType<typeof createClient>,
  config: OrderConfig,
  params: Record<string, unknown>
): Promise<string> {
  const clientName = params.client_name as string;
  const clientPhone = params.client_phone as string;
  const clientEmail = params.client_email as string | undefined;
  const items = params.items as Array<{ name: string; quantity: number; unit_price: number }>;
  const notes = params.notes as string | undefined;

  if (!clientName || !clientPhone) {
    return "Informations manquantes. Il faut au minimum: nom du client et numero de telephone.";
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return "Erreur: la commande doit contenir au moins un article.";
  }

  // Validate and calculate totals
  let subtotal = 0;
  for (const item of items) {
    if (!item.name || !item.quantity || item.quantity <= 0) {
      return `Erreur: article invalide — chaque article doit avoir un nom et une quantite positive.`;
    }
    if (item.unit_price < 0) {
      return `Erreur: prix invalide pour ${item.name}.`;
    }
    subtotal += item.quantity * item.unit_price;
  }

  // Round to 2 decimals
  subtotal = Math.round(subtotal * 100) / 100;
  const taxRate = config.tax_rate || 0;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  // Generate order number: CMD-YYYYMMDD-XXXXX
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = String(Math.floor(10000 + Math.random() * 90000));
  const orderNumber = `CMD-${dateStr}-${randomPart}`;

  console.log(`[OrderWebhook] Creating order: ${orderNumber}, ${items.length} items, total: ${totalAmount.toFixed(2)} ${config.currency}`);

  // Find contact by phone
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
    // Create contact
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

  // Insert order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: config.user_id,
      agent_id: config.agent_id,
      contact_id: contactId,
      order_number: orderNumber,
      client_name: clientName.trim(),
      client_phone: normalizedPhone,
      client_email: clientEmail?.trim() || null,
      notes: notes || null,
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency: config.currency || "EUR",
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError) {
    console.log(`[OrderWebhook] Create order error: ${orderError.message}`);
    return "Erreur lors de la sauvegarde de la commande. Veuillez reessayer.";
  }

  // Insert order items
  const itemsToInsert = items.map(item => ({
    order_id: order.id,
    item_name: item.name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: Math.round(item.quantity * item.unit_price * 100) / 100,
  }));

  const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert);
  if (itemsError) {
    console.log(`[OrderWebhook] Insert items error: ${itemsError.message}`);
  }

  console.log(`[OrderWebhook] Order saved: ${orderNumber}, total: ${totalAmount.toFixed(2)} ${config.currency}`);

  let resultMsg = `Commande enregistree avec succes.\nNumero de commande: ${orderNumber}\n`;
  resultMsg += `Sous-total: ${subtotal.toFixed(2)} ${config.currency}`;
  if (taxAmount > 0) {
    resultMsg += `\nTVA: ${taxAmount.toFixed(2)} ${config.currency}`;
  }
  resultMsg += `\nTotal: ${totalAmount.toFixed(2)} ${config.currency}`;
  resultMsg += `\nCommunique le numero de commande ${orderNumber} au client.`;

  return resultMsg;
}

// ========== Handler: Send SMS Invoice ==========
async function handleSendSmsInvoice(
  supabase: ReturnType<typeof createClient>,
  config: OrderConfig,
  orderNumber: string
): Promise<string> {
  if (!orderNumber) {
    return "Numero de commande manquant.";
  }

  console.log(`[OrderWebhook] Sending SMS invoice for ${orderNumber}`);

  // Fetch order + items
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .eq("user_id", config.user_id)
    .single();

  if (orderError || !order) {
    return `Commande ${orderNumber} introuvable.`;
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  // Build SMS content
  let smsContent = `Votre commande ${orderNumber}:\n`;

  if (items && items.length > 0) {
    for (const item of items) {
      smsContent += `${item.quantity}x ${item.item_name} - ${item.subtotal.toFixed(2)} ${order.currency}\n`;
    }
  }

  smsContent += `---\n`;
  if (order.tax_amount > 0) {
    smsContent += `Sous-total: ${order.subtotal_amount.toFixed(2)} ${order.currency}\n`;
    smsContent += `TVA: ${order.tax_amount.toFixed(2)} ${order.currency}\n`;
  }
  smsContent += `TOTAL: ${order.total_amount.toFixed(2)} ${order.currency}\n`;
  smsContent += `Merci pour votre commande !`;

  // Send SMS via existing function
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const res = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        to: order.client_phone,
        content: smsContent,
        user_id: config.user_id,
        contact_id: order.contact_id,
      }),
    });

    if (!res.ok) {
      const result = await res.json();
      console.log(`[OrderWebhook] SMS error: ${res.status} — ${JSON.stringify(result)}`);
      return "Erreur lors de l'envoi du SMS. Veuillez reessayer.";
    }

    return `SMS facture envoye avec succes au ${order.client_phone}.`;
  } catch (err) {
    console.log(`[OrderWebhook] SMS error: ${(err as Error).message}`);
    return "Erreur technique lors de l'envoi du SMS.";
  }
}

// ========== Handler: Send Email Invoice ==========
async function handleSendEmailInvoice(
  supabase: ReturnType<typeof createClient>,
  config: OrderConfig,
  orderNumber: string
): Promise<string> {
  if (!orderNumber) {
    return "Numero de commande manquant.";
  }

  console.log(`[OrderWebhook] Sending email invoice for ${orderNumber}`);

  // Fetch order + items
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .eq("user_id", config.user_id)
    .single();

  if (orderError || !order) {
    return `Commande ${orderNumber} introuvable.`;
  }

  if (!order.client_email) {
    return "L'adresse email du client n'est pas disponible. Impossible d'envoyer la facture par email.";
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  // Build HTML invoice
  let itemsHtml = "";
  if (items && items.length > 0) {
    for (const item of items) {
      itemsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px 16px; font-size: 14px; color: #334155;">${item.item_name}</td>
          <td style="padding: 12px 16px; text-align: center; font-size: 14px; color: #334155;">${item.quantity}</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; color: #334155;">${item.unit_price.toFixed(2)} ${order.currency}</td>
          <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #0f172a;">${item.subtotal.toFixed(2)} ${order.currency}</td>
        </tr>`;
    }
  }

  let totalsHtml = `
    <tr>
      <td colspan="3" style="padding: 12px 16px; text-align: right; font-size: 14px; color: #64748b;">Sous-total</td>
      <td style="padding: 12px 16px; text-align: right; font-size: 14px; font-weight: 600; color: #0f172a;">${order.subtotal_amount.toFixed(2)} ${order.currency}</td>
    </tr>`;

  if (order.tax_amount > 0) {
    totalsHtml += `
    <tr>
      <td colspan="3" style="padding: 8px 16px; text-align: right; font-size: 14px; color: #64748b;">TVA</td>
      <td style="padding: 8px 16px; text-align: right; font-size: 14px; color: #0f172a;">${order.tax_amount.toFixed(2)} ${order.currency}</td>
    </tr>`;
  }

  totalsHtml += `
    <tr style="border-top: 2px solid #0f172a;">
      <td colspan="3" style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: #0f172a;">TOTAL</td>
      <td style="padding: 16px; text-align: right; font-size: 16px; font-weight: 700; color: #0f172a;">${order.total_amount.toFixed(2)} ${order.currency}</td>
    </tr>`;

  const orderDate = new Date(order.created_at).toLocaleDateString("fr-FR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <!-- Header -->
      <div style="background: #0f172a; padding: 32px; text-align: center;">
        <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">Facture</h1>
        <p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">Commande ${orderNumber}</p>
      </div>

      <!-- Content -->
      <div style="padding: 32px;">
        <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;">Bonjour <strong style="color: #0f172a;">${order.client_name}</strong>,</p>
        <p style="margin: 0 0 24px; font-size: 14px; color: #64748b;">Merci pour votre commande. Voici le detail :</p>

        <p style="margin: 0 0 8px; font-size: 12px; color: #94a3b8;">Date : ${orderDate}</p>

        <!-- Items table -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <thead>
            <tr style="border-bottom: 2px solid #0f172a;">
              <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">Article</th>
              <th style="padding: 12px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">Qte</th>
              <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">Prix unit.</th>
              <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            ${totalsHtml}
          </tfoot>
        </table>

        ${order.notes ? `<p style="margin: 24px 0 0; padding: 16px; background: #f1f5f9; border-radius: 8px; font-size: 13px; color: #475569;"><strong>Notes :</strong> ${order.notes}</p>` : ""}
      </div>

      <!-- Footer -->
      <div style="padding: 24px 32px; background: #f8fafc; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 13px; color: #94a3b8;">Merci pour votre confiance !</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const res = await fetch(`${supabaseUrl}/functions/v1/send-rdv-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        user_id: config.user_id,
        to: order.client_email,
        client_name: order.client_name,
        date: "",
        time: "",
        duration_minutes: 0,
        motif: "",
        custom_subject: `Facture - Commande ${orderNumber}`,
        custom_body: htmlBody,
      }),
    });

    if (!res.ok) {
      const result = await res.json();
      console.log(`[OrderWebhook] Email error: ${res.status} — ${JSON.stringify(result)}`);
      return "Erreur lors de l'envoi de l'email. Veuillez reessayer.";
    }

    return `Facture email envoyee avec succes a ${order.client_email}.`;
  } catch (err) {
    console.log(`[OrderWebhook] Email error: ${(err as Error).message}`);
    return "Erreur technique lors de l'envoi de l'email.";
  }
}

// ========== Handler: Transfer Call ==========
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
    console.log("[OrderTransfer] Twilio credentials not configured");
    return "Erreur: les identifiants Twilio ne sont pas configures.";
  }

  console.log(`[OrderTransfer] Redirecting call ${callSid} to ${phoneNumber}`);

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
      console.log(`[OrderTransfer] Twilio error: ${res.status} — ${errText}`);
      await supabase
        .from("conversations")
        .update({ transferred_to: phoneNumber, transfer_status: "failed" })
        .eq("twilio_call_sid", callSid);
      return `Erreur lors du transfert: ${res.status}. Veuillez reessayer.`;
    }

    console.log(`[OrderTransfer] Success — call redirected to ${phoneNumber}`);
    await supabase
      .from("conversations")
      .update({ transferred_to: phoneNumber, transfer_status: "success" })
      .eq("twilio_call_sid", callSid);

    return `Le transfert vers ${phoneNumber} est en cours. L'appelant va etre mis en relation avec un conseiller.`;
  } catch (err) {
    console.log(`[OrderTransfer] Error: ${(err as Error).message}`);
    await supabase
      .from("conversations")
      .update({ transferred_to: phoneNumber, transfer_status: "failed" })
      .eq("twilio_call_sid", callSid);
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
      .from("agent_order_config")
      .select("*")
      .eq("webhook_secret", webhookSecret)
      .single();

    if (configError || !config) {
      console.log(`[OrderWebhook] Config not found for secret: ${webhookSecret.substring(0, 8)}...`);
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action;
    console.log(`[OrderWebhook] Action: ${action}, body: ${JSON.stringify(body)}`);

    let result: string;

    switch (action) {
      case "search_client":
        result = await handleSearchClient(supabase, config.user_id, body.query);
        break;
      case "register_client":
        result = await handleRegisterClient(supabase, config.user_id, body);
        break;
      case "save_order":
        result = await handleSaveOrder(supabase, config as OrderConfig, body);
        break;
      case "send_sms_invoice":
        result = await handleSendSmsInvoice(supabase, config as OrderConfig, body.order_number);
        break;
      case "send_email_invoice":
        result = await handleSendEmailInvoice(supabase, config as OrderConfig, body.order_number);
        break;
      case "transfer_call":
        result = await handleTransferCall(supabase, body.call_sid, body.phone_number);
        break;
      default:
        result = `Action inconnue: ${action}`;
    }

    console.log(`[OrderWebhook] Result: ${result}`);
    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(`[OrderWebhook] Error: ${(error as Error).message}`);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
