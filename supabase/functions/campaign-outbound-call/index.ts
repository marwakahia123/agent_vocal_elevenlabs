import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Resolve or register phone number with ElevenLabs, returns phone_number_id
async function getOrCreatePhoneNumberId(
  apiKey: string,
  phoneNumber: string,
  twilioSid: string,
  twilioToken: string
): Promise<string> {
  // 1. List existing phone numbers to find a match
  const listRes = await fetch(`${ELEVENLABS_API_BASE}/v1/convai/phone-numbers`, {
    headers: { "xi-api-key": apiKey },
  });
  if (listRes.ok) {
    const phones = await listRes.json();
    // phones is an array of phone number objects
    const arr = Array.isArray(phones) ? phones : phones.phone_numbers || [];
    for (const p of arr) {
      if (p.phone_number === phoneNumber) {
        console.log(`[campaign-outbound] Found existing phone_number_id: ${p.phone_number_id}`);
        return p.phone_number_id;
      }
    }
  }

  // 2. Not found — register it
  console.log(`[campaign-outbound] Registering phone number ${phoneNumber} with ElevenLabs`);
  const createRes = await fetch(`${ELEVENLABS_API_BASE}/v1/convai/phone-numbers`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone_number: phoneNumber,
      provider: "twilio",
      label: `Campaign ${phoneNumber}`,
      sid: twilioSid,
      token: twilioToken,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error(`[campaign-outbound] Failed to register phone: ${errText}`);
    throw new Error(`Impossible d'enregistrer le numero: ${createRes.status}`);
  }

  const created = await createRes.json();
  console.log(`[campaign-outbound] Registered phone_number_id: ${created.phone_number_id}`);
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
    const body = await req.json();
    const { action, campaign_id } = body;
    console.log(`[campaign-outbound] action=${action} campaign_id=${campaign_id}`);

    // For "continue" action (self-invoked), skip auth check
    if (action !== "continue") {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return jsonResponse({ error: "Non autorise" }, 401);
      }
    }

    // ─── PAUSE ───
    if (action === "pause") {
      const { error } = await supabase
        .from("campaign_groups")
        .update({ status: "paused" })
        .eq("id", campaign_id);
      if (error) throw error;
      console.log(`[campaign-outbound] Campaign ${campaign_id} paused`);
      return jsonResponse({ ok: true, message: "Campagne en pause" });
    }

    // ─── START / RESUME / CONTINUE ───
    if (action === "start" || action === "resume" || action === "continue") {
      // Verify Twilio config
      const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
      const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
      const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
      const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        return jsonResponse({ error: "Twilio non configure. Contactez l'administrateur." }, 400);
      }
      if (!apiKey) {
        return jsonResponse({ error: "ELEVENLABS_API_KEY non configure" }, 400);
      }

      // Load campaign with agent
      const { data: campaign, error: campError } = await supabase
        .from("campaign_groups")
        .select("*, agent:agents(id, name, elevenlabs_agent_id)")
        .eq("id", campaign_id)
        .single();

      if (campError || !campaign) {
        return jsonResponse({ error: "Campagne introuvable" }, 404);
      }

      const agent = campaign.agent as { id: string; name: string; elevenlabs_agent_id: string } | null;
      if (!agent?.elevenlabs_agent_id) {
        return jsonResponse({ error: "Aucun agent associe a cette campagne" }, 400);
      }

      // Resolve phone number ID with ElevenLabs (register if needed)
      let phoneNumberId: string;
      try {
        phoneNumberId = await getOrCreatePhoneNumberId(apiKey, twilioPhoneNumber, twilioAccountSid, twilioAuthToken);
      } catch (phoneErr) {
        console.error("[campaign-outbound] Phone registration error:", phoneErr);
        return jsonResponse({ error: (phoneErr as Error).message }, 400);
      }

      // Update status to running if starting
      if (action === "start" || action === "resume") {
        const updates: Record<string, unknown> = { status: "running" };
        if (action === "start") updates.started_at = new Date().toISOString();
        await supabase.from("campaign_groups").update(updates).eq("id", campaign_id);
      }

      // Process contacts sequentially (up to 3 per invocation to avoid timeout)
      let processed = 0;
      const MAX_PER_INVOCATION = 1;

      while (processed < MAX_PER_INVOCATION) {
        // Check if still running
        const { data: currentCampaign } = await supabase
          .from("campaign_groups")
          .select("status, budget_euros, cost_euros")
          .eq("id", campaign_id)
          .single();

        if (!currentCampaign || currentCampaign.status !== "running") {
          console.log(`[campaign-outbound] Campaign stopped (status=${currentCampaign?.status})`);
          break;
        }

        // Check budget
        if (currentCampaign.budget_euros && currentCampaign.cost_euros >= currentCampaign.budget_euros) {
          console.log(`[campaign-outbound] Budget exceeded, pausing`);
          await supabase.from("campaign_groups").update({ status: "paused" }).eq("id", campaign_id);
          break;
        }

        // Find next pending contact
        const { data: nextContact } = await supabase
          .from("campaign_contacts")
          .select("*, contact:contacts(first_name, last_name, phone)")
          .eq("campaign_id", campaign_id)
          .eq("status", "pending")
          .order("created_at")
          .limit(1)
          .single();

        if (!nextContact) {
          // All done
          console.log(`[campaign-outbound] No more pending contacts, completing campaign`);
          await supabase
            .from("campaign_groups")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", campaign_id);
          break;
        }

        const contact = nextContact.contact as { first_name: string; last_name: string; phone: string | null } | null;
        if (!contact?.phone) {
          console.log(`[campaign-outbound] Contact ${nextContact.contact_id} has no phone, marking failed`);
          await supabase.from("campaign_contacts").update({ status: "failed", notes: "Pas de numero" }).eq("id", nextContact.id);
          await supabase.from("campaign_groups").update({
            contacts_called: campaign.contacts_called + processed + 1,
            contacts_failed: campaign.contacts_failed + 1,
          }).eq("id", campaign_id);
          processed++;
          continue;
        }

        const toNumber = normalizePhone(contact.phone);
        console.log(`[campaign-outbound] Calling ${contact.first_name} ${contact.last_name} at ${toNumber}`);

        // Mark as calling
        await supabase.from("campaign_contacts").update({
          status: "calling",
          called_at: new Date().toISOString(),
        }).eq("id", nextContact.id);

        // Initiate outbound call via ElevenLabs
        let conversationId: string | null = null;
        let callStatus = "failed";
        let callDuration = 0;
        let elCost = 0; // ElevenLabs cost from metadata.charging

        try {
          const outboundRes = await fetch(
            `${ELEVENLABS_API_BASE}/v1/convai/twilio/outbound-call`,
            {
              method: "POST",
              headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                agent_id: agent.elevenlabs_agent_id,
                agent_phone_number_id: phoneNumberId,
                to_number: toNumber,
                conversation_initiation_client_data: {
                  dynamic_variables: {
                    caller_phone: toNumber,
                  },
                },
              }),
            }
          );

          console.log(`[campaign-outbound] EL outbound-call status: ${outboundRes.status}`);

          if (!outboundRes.ok) {
            const errText = await outboundRes.text();
            console.error(`[campaign-outbound] EL outbound-call error: ${errText}`);
            throw new Error(`ElevenLabs error: ${outboundRes.status}`);
          }

          const outboundData = await outboundRes.json();
          conversationId = outboundData.conversation_id || null;
          console.log(`[campaign-outbound] Call initiated, conversation_id: ${conversationId}`);

          // Create conversation record
          if (conversationId) {
            const { data: convRecord } = await supabase.from("conversations").insert({
              user_id: campaign.user_id,
              agent_id: agent.id,
              elevenlabs_agent_id: agent.elevenlabs_agent_id,
              elevenlabs_conversation_id: conversationId,
              status: "active",
              call_type: "outbound",
              caller_phone: toNumber,
            }).select("id").single();

            if (convRecord) {
              await supabase.from("campaign_contacts").update({
                conversation_id: convRecord.id,
              }).eq("id", nextContact.id);
            }
          }

          // Poll for call completion (max 80s to stay within Supabase edge function timeout ~150s)
          if (conversationId) {
            const maxWait = 80;
            const pollInterval = 5;
            let waited = 0;
            let lastKnownStatus = "initiated";

            while (waited < maxWait) {
              await sleep(pollInterval * 1000);
              waited += pollInterval;

              try {
                const convRes = await fetch(
                  `${ELEVENLABS_API_BASE}/v1/convai/conversations/${conversationId}`,
                  { headers: { "xi-api-key": apiKey } }
                );

                if (convRes.ok) {
                  const convData = await convRes.json();
                  lastKnownStatus = convData.status;
                  console.log(`[campaign-outbound] Poll ${waited}s: status=${convData.status}`);

                  if (convData.status === "done" || convData.status === "failed") {
                    callDuration = Math.round(convData.metadata?.call_duration_secs || 0);
                    const hasTranscript = convData.transcript && convData.transcript.length > 1;
                    // Extract ElevenLabs cost from charging data
                    const charging = convData.metadata?.charging;
                    if (charging?.cost != null) {
                      elCost = Number(charging.cost);
                    }
                    console.log(`[campaign-outbound] Call done: elStatus=${convData.status}, duration=${callDuration}s, transcript=${convData.transcript?.length || 0}, elCost=${elCost}, charging=${JSON.stringify(charging || {})}`);

                    if (convData.status === "failed") {
                      callStatus = "failed";
                    } else if (callDuration === 0 && !hasTranscript) {
                      callStatus = "no_answer";
                    } else {
                      callStatus = "completed";
                    }
                    break;
                  }
                }
              } catch (pollErr) {
                console.error(`[campaign-outbound] Poll error:`, pollErr);
              }
            }

            if (waited >= maxWait) {
              console.log(`[campaign-outbound] Timeout at ${waited}s: lastKnownStatus=${lastKnownStatus}`);
              if (lastKnownStatus === "in-progress" || lastKnownStatus === "processing") {
                // Call was answered but not yet finished — mark completed, reconciliation will refine
                callStatus = "completed";
              } else {
                // Still "initiated" after 80s = no one answered
                callStatus = "no_answer";
              }
            }
          }
        } catch (callErr) {
          console.error(`[campaign-outbound] Call error:`, callErr);
          callStatus = "failed";
        }

        // Update contact result — use ElevenLabs real cost
        const contactCost = elCost;
        console.log(`[campaign-outbound] Updating contact ${nextContact.id}: status=${callStatus}, duration=${callDuration}, elCost=${contactCost}`);
        const { error: contactUpdateErr } = await supabase.from("campaign_contacts").update({
          status: callStatus,
          call_duration_seconds: callDuration,
          cost_euros: contactCost,
        }).eq("id", nextContact.id);
        if (contactUpdateErr) {
          console.error(`[campaign-outbound] Contact update error:`, contactUpdateErr.message, contactUpdateErr.details);
          // Retry with simpler update
          const { error: retryErr } = await supabase.from("campaign_contacts").update({
            status: callStatus,
          }).eq("id", nextContact.id);
          if (retryErr) console.error(`[campaign-outbound] Contact status retry failed:`, retryErr.message);
        }

        // Update conversation status
        if (conversationId) {
          const { error: convUpdateErr } = await supabase.from("conversations").update({
            status: callStatus === "completed" ? "ended" : "error",
            duration_seconds: callDuration,
            ended_at: new Date().toISOString(),
          }).eq("elevenlabs_conversation_id", conversationId);
          if (convUpdateErr) console.error(`[campaign-outbound] Conversation update error:`, convUpdateErr.message);
        }

        // Update campaign stats
        const isAnswered = callStatus === "completed" || callStatus === "answered";
        const isFailed = callStatus === "failed" || callStatus === "no_answer" || callStatus === "busy";

        const { data: freshCampaign } = await supabase
          .from("campaign_groups")
          .select("contacts_called, contacts_answered, contacts_failed, cost_euros")
          .eq("id", campaign_id)
          .single();

        if (freshCampaign) {
          await supabase.from("campaign_groups").update({
            contacts_called: freshCampaign.contacts_called + 1,
            contacts_answered: freshCampaign.contacts_answered + (isAnswered ? 1 : 0),
            contacts_failed: freshCampaign.contacts_failed + (isFailed ? 1 : 0),
            cost_euros: freshCampaign.cost_euros + contactCost,
          }).eq("id", campaign_id);
        }

        console.log(`[campaign-outbound] Contact done: status=${callStatus}, duration=${callDuration}s, cost=${contactCost.toFixed(3)}EUR`);
        processed++;

        // Small delay between calls
        await sleep(2000);
      }

      // Self-invoke for next batch if there are more pending contacts
      if (processed >= MAX_PER_INVOCATION) {
        const { data: remaining } = await supabase
          .from("campaign_contacts")
          .select("id")
          .eq("campaign_id", campaign_id)
          .eq("status", "pending")
          .limit(1);

        const { data: checkCampaign } = await supabase
          .from("campaign_groups")
          .select("status")
          .eq("id", campaign_id)
          .single();

        if (remaining && remaining.length > 0 && checkCampaign?.status === "running") {
          console.log(`[campaign-outbound] More contacts remaining, self-invoking for next batch`);
          // Fire and forget — don't await
          fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/campaign-outbound-call`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "continue", campaign_id }),
          }).catch((err) => console.error("[campaign-outbound] Self-invoke error:", err));
        }
      }

      return jsonResponse({ ok: true, processed });
    }

    return jsonResponse({ error: "Action inconnue" }, 400);
  } catch (error) {
    console.error("[campaign-outbound] Error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
