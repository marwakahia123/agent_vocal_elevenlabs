import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

function twimlResponse(inner: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { "Content-Type": "application/xml" } }
  );
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\.()]/g, "");
  // French format: convert 0X to +33X
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = "+33" + cleaned.substring(1);
  }
  return cleaned;
}

Deno.serve(async (req) => {
  // Twilio sends POST with application/x-www-form-urlencoded
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    console.log("[twilio-webhook] API key present:", !!apiKey);
    if (!apiKey) {
      console.error("[twilio-webhook] ELEVENLABS_API_KEY not configured!");
      return twimlResponse(
        `<Say language="fr-FR">Erreur de configuration du service. Veuillez reessayer plus tard.</Say><Hangup/>`
      );
    }

    // Parse Twilio webhook params (application/x-www-form-urlencoded)
    const formData = await req.formData();
    const forwardedFrom = formData.get("ForwardedFrom")?.toString();
    const callerPhone = formData.get("From")?.toString() || "";
    const toNumber = formData.get("To")?.toString() || "";
    const callSid = formData.get("CallSid")?.toString() || "";

    console.log("[twilio-webhook] From:", callerPhone, "To:", toNumber, "ForwardedFrom:", forwardedFrom, "CallSid:", callSid);

    // Determine which number was originally called
    // ForwardedFrom = the number that set up call forwarding to Twilio
    const lookupNumber = forwardedFrom || toNumber;

    if (!lookupNumber) {
      console.log("[twilio-webhook] No lookupNumber found, aborting");
      return twimlResponse(
        `<Say language="fr-FR">Desolee, aucun agent n'est configure pour ce numero.</Say><Hangup/>`
      );
    }

    const normalizedPhone = normalizePhone(lookupNumber);
    console.log("[twilio-webhook] lookupNumber:", lookupNumber, "normalized:", normalizedPhone);

    // Look up the phone_number -> agent mapping
    // Try exact match first, then try without country code variations
    const { data: phoneRecord, error: phoneError } = await supabase
      .from("phone_numbers")
      .select("id, user_id, agent_id, phone_number, status, agents(id, elevenlabs_agent_id, name)")
      .eq("status", "active")
      .or(
        `phone_number.eq.${normalizedPhone},phone_number.eq.${lookupNumber}`
      )
      .limit(1)
      .single();

    console.log("[twilio-webhook] phone_numbers lookup result:", JSON.stringify(phoneRecord), "error:", phoneError?.message || "none");

    if (
      !phoneRecord ||
      !phoneRecord.agents ||
      !(phoneRecord.agents as Record<string, string>).elevenlabs_agent_id
    ) {
      // Debug: also check without status filter
      const { data: allRecords } = await supabase
        .from("phone_numbers")
        .select("id, phone_number, status, agent_id")
        .or(
          `phone_number.eq.${normalizedPhone},phone_number.eq.${lookupNumber}`
        );
      console.log("[twilio-webhook] ALL matching numbers (any status):", JSON.stringify(allRecords));
      return twimlResponse(
        `<Say language="fr-FR">Desolee, aucun agent n'est configure pour ce numero. Au revoir.</Say><Hangup/>`
      );
    }

    const agentData = phoneRecord.agents as Record<string, string>;
    const elevenLabsAgentId = agentData.elevenlabs_agent_id;
    console.log("[twilio-webhook] Found agent:", agentData.name, "elevenlabs_id:", elevenLabsAgentId);

    // Use ElevenLabs' Twilio register-call endpoint (returns Twilio-compatible TwiML)
    const registerCallRes = await fetch(
      `${ELEVENLABS_API_BASE}/v1/convai/twilio/register-call`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: elevenLabsAgentId,
          from_number: callerPhone,
          to_number: toNumber,
          direction: "inbound",
          conversation_initiation_client_data: {
            dynamic_variables: {
              call_sid: callSid,
              caller_phone: callerPhone,
            },
          },
        }),
      }
    );

    console.log("[twilio-webhook] register-call response status:", registerCallRes.status);

    if (!registerCallRes.ok) {
      const errText = await registerCallRes.text();
      console.error("[twilio-webhook] register-call error:", registerCallRes.status, errText);
      return twimlResponse(
        `<Say language="fr-FR">Desolee, le service est temporairement indisponible. Veuillez reessayer plus tard.</Say><Hangup/>`
      );
    }

    const twimlBody = await registerCallRes.text();
    console.log("[twilio-webhook] register-call TwiML:", twimlBody.slice(0, 300));

    // Extract ElevenLabs conversation_id from TwiML
    const convIdMatch = twimlBody.match(/name="conversation_id"\s+value="([^"]+)"/);
    const elConversationId = convIdMatch ? convIdMatch[1] : null;
    console.log("[twilio-webhook] ElevenLabs conversation_id:", elConversationId);

    // Create a conversation record with the ElevenLabs conversation_id
    await supabase.from("conversations").insert({
      user_id: phoneRecord.user_id,
      agent_id: phoneRecord.agent_id,
      elevenlabs_agent_id: elevenLabsAgentId,
      elevenlabs_conversation_id: elConversationId,
      status: "active",
      call_type: "inbound",
      caller_phone: callerPhone,
      twilio_call_sid: callSid,
    });

    return new Response(twimlBody, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("[twilio-webhook] CATCH error:", error);
    return twimlResponse(
      `<Say language="fr-FR">Une erreur s'est produite. Veuillez reessayer plus tard.</Say><Hangup/>`
    );
  }
});
