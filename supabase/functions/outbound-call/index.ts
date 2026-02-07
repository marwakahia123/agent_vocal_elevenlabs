import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\.()]/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = "+33" + cleaned.substring(1);
  }
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

async function getOrCreatePhoneNumberId(
  apiKey: string,
  phoneNumber: string,
  twilioSid: string,
  twilioToken: string
): Promise<string> {
  const listRes = await fetch(`${ELEVENLABS_API_BASE}/v1/convai/phone-numbers`, {
    headers: { "xi-api-key": apiKey },
  });
  if (listRes.ok) {
    const phones = await listRes.json();
    const arr = Array.isArray(phones) ? phones : phones.phone_numbers || [];
    for (const p of arr) {
      if (p.phone_number === phoneNumber) {
        return p.phone_number_id;
      }
    }
  }

  const createRes = await fetch(`${ELEVENLABS_API_BASE}/v1/convai/phone-numbers`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number: phoneNumber,
      provider: "twilio",
      label: `HallCall ${phoneNumber}`,
      sid: twilioSid,
      token: twilioToken,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Impossible d'enregistrer le numero: ${errText}`);
  }

  const created = await createRes.json();
  return created.phone_number_id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: "Non autorise" }, 401);
    }

    const { elevenlabs_agent_id, agent_id, to_number } = await req.json();

    if (!elevenlabs_agent_id || !to_number) {
      return jsonResponse({ error: "elevenlabs_agent_id et to_number sont requis" }, 400);
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!apiKey) return jsonResponse({ error: "ELEVENLABS_API_KEY non configure" }, 400);
    if (!twilioSid || !twilioToken || !twilioPhone) {
      return jsonResponse({ error: "Twilio non configure" }, 400);
    }

    // Get phone number ID
    const phoneNumberId = await getOrCreatePhoneNumberId(apiKey, twilioPhone, twilioSid, twilioToken);
    const normalized = normalizePhone(to_number);

    console.log(`[outbound-call] Calling ${normalized} with agent ${elevenlabs_agent_id}, phoneNumberId=${phoneNumberId}`);

    // Make the call
    const outboundRes = await fetch(
      `${ELEVENLABS_API_BASE}/v1/convai/twilio/outbound-call`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: elevenlabs_agent_id,
          agent_phone_number_id: phoneNumberId,
          to_number: normalized,
        }),
      }
    );

    if (!outboundRes.ok) {
      const errText = await outboundRes.text();
      console.error(`[outbound-call] EL error: ${errText}`);
      return jsonResponse({ error: `Erreur ElevenLabs: ${outboundRes.status}` }, 500);
    }

    const outboundData = await outboundRes.json();
    const conversationId = outboundData.conversation_id || null;
    console.log(`[outbound-call] Call initiated, conversation_id: ${conversationId}`);

    // Save conversation in DB
    if (conversationId) {
      await supabase.from("conversations").insert({
        user_id: user.id,
        agent_id: agent_id || null,
        elevenlabs_agent_id,
        elevenlabs_conversation_id: conversationId,
        status: "active",
        call_type: "outbound",
        caller_phone: normalized,
      });
    }

    return jsonResponse({
      ok: true,
      conversation_id: conversationId,
      call_sid: outboundData.callSid || null,
    });
  } catch (error) {
    console.error("[outbound-call] Error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
