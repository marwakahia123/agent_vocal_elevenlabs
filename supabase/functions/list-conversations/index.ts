import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";
const COST_PER_MINUTE_EUR = 0.12; // fallback if ElevenLabs charging not available

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ElevenLabsTranscriptEntry {
  role: "agent" | "user";
  message: string;
  time_in_call_secs?: number;
}

interface ElevenLabsMetadata {
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  accepted_time_unix_secs?: number;
  [key: string]: unknown;
}

interface ElevenLabsConversationDetail {
  conversation_id: string;
  status: string;
  transcript?: ElevenLabsTranscriptEntry[];
  metadata?: ElevenLabsMetadata;
  analysis?: Record<string, unknown>;
}

async function fetchElevenLabsConversation(
  apiKey: string,
  conversationId: string
): Promise<ElevenLabsConversationDetail | null> {
  try {
    const res = await fetch(
      `${ELEVENLABS_API_BASE}/v1/convai/conversations/${conversationId}`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (!res.ok) {
      console.log(`[list-conversations] EL fetch failed for ${conversationId}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    console.log(`[list-conversations] EL full metadata for ${conversationId}:`, JSON.stringify(data.metadata));
    return data;
  } catch (err) {
    console.error(`[list-conversations] EL fetch error for ${conversationId}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

    // Verifier l'authentification
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorise" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { elevenlabsAgentId } = await req.json();
    console.log("[list-conversations] user:", user.id, "elevenlabsAgentId:", elevenlabsAgentId);

    let query = supabase
      .from("conversations")
      .select(`
        id,
        agent_id,
        elevenlabs_agent_id,
        elevenlabs_conversation_id,
        status,
        started_at,
        ended_at,
        duration_seconds,
        cost_euros,
        call_type,
        caller_phone,
        transferred_to,
        transfer_status,
        agent:agents(name),
        messages (
          id,
          source,
          content,
          created_at
        )
      `)
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(50);

    if (elevenlabsAgentId) {
      query = query.eq("elevenlabs_agent_id", elevenlabsAgentId);
    }

    const { data, error } = await query;

    console.log("[list-conversations] found:", data?.length || 0, "conversations, error:", error?.message || "none");

    if (error) throw error;

    if (!data || data.length === 0) {
      return new Response(JSON.stringify({ conversations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enrich conversations that have an ElevenLabs conversation ID
    if (apiKey) {
      const enrichPromises = data.map(async (conv) => {
        if (!conv.elevenlabs_conversation_id) return conv;

        const elData = await fetchElevenLabsConversation(apiKey, conv.elevenlabs_conversation_id);
        if (!elData) return conv;

        console.log(`[list-conversations] EL data for ${conv.elevenlabs_conversation_id}: status=${elData.status}, transcript=${elData.transcript?.length || 0} entries`);

        // Calculate real duration from metadata
        let realDuration = conv.duration_seconds;
        const meta = elData.metadata;
        if (meta?.call_duration_secs) {
          realDuration = Math.round(meta.call_duration_secs);
        } else if (elData.transcript && elData.transcript.length > 0) {
          const lastEntry = elData.transcript[elData.transcript.length - 1];
          if (lastEntry.time_in_call_secs) {
            realDuration = Math.round(lastEntry.time_in_call_secs);
          }
        }

        // Extract ElevenLabs cost from charging data
        let elCost = 0;
        const charging = (meta as Record<string, unknown> | undefined)?.charging as Record<string, unknown> | undefined;
        if (charging?.cost != null && Number(charging.cost) > 0) {
          elCost = Number(charging.cost);
        }
        // Fallback: calculate cost from duration if EL doesn't provide it
        if (elCost === 0 && (realDuration || 0) > 0) {
          elCost = Math.round(((realDuration || 0) / 60) * COST_PER_MINUTE_EUR * 100) / 100;
        }
        console.log(`[list-conversations] Cost for ${conv.elevenlabs_conversation_id}: elCost=${elCost}, charging=${JSON.stringify(charging || "none")}`);

        // Map ElevenLabs status to our status
        const elStatus = elData.status;
        let mappedStatus = conv.status;
        if (elStatus === "done" || elStatus === "ended") {
          mappedStatus = "ended";
        } else if (elStatus === "failed" || elStatus === "error") {
          mappedStatus = "error";
        }

        // AWAITED: Update conversation in DB
        const needsUpdate =
          (realDuration !== conv.duration_seconds) ||
          (mappedStatus !== conv.status && conv.status === "active") ||
          (elCost > 0 && !conv.cost_euros);

        if (needsUpdate) {
          const updateData: Record<string, unknown> = {};
          if (realDuration !== conv.duration_seconds) {
            updateData.duration_seconds = realDuration;
          }
          if (elCost > 0) {
            updateData.cost_euros = elCost;
          }
          if (mappedStatus !== conv.status && conv.status === "active") {
            updateData.status = mappedStatus;
            if (!conv.ended_at && meta?.start_time_unix_secs && meta?.call_duration_secs) {
              updateData.ended_at = new Date((meta.start_time_unix_secs + meta.call_duration_secs) * 1000).toISOString();
            }
          }
          const { error: upErr } = await supabase.from("conversations").update(updateData).eq("id", conv.id);
          if (upErr) console.error(`[list-conversations] DB update error for ${conv.id}:`, upErr.message);
          else console.log(`[list-conversations] DB updated for ${conv.id}:`, updateData);
        }

        // AWAITED: Reconcile campaign_contacts
        if (conv.id && (mappedStatus === "ended" || mappedStatus === "error")) {
          const wasAnswered = (realDuration || 0) > 0
            || (elData.transcript && elData.transcript.length > 1);
          const contactStatus = wasAnswered ? "completed" : "no_answer";

          const { error: ccErr } = await supabase.from("campaign_contacts")
            .update({
              status: contactStatus,
              call_duration_seconds: realDuration || 0,
              cost_euros: elCost,
            })
            .eq("conversation_id", conv.id)
            .in("status", ["calling", "no_answer", "completed"]);
          if (ccErr) console.error(`[list-conversations] campaign_contacts reconcile error:`, ccErr.message);
          else console.log(`[list-conversations] Reconciled campaign_contact for conv ${conv.id}: status=${contactStatus}, cost=${elCost}`);
        }

        // Convert ElevenLabs transcript to messages format if we don't have messages
        let messages = conv.messages;
        if (elData.transcript && elData.transcript.length > 0 && (!messages || messages.length === 0)) {
          messages = elData.transcript.map((entry, idx) => ({
            id: `el-${conv.elevenlabs_conversation_id}-${idx}`,
            source: entry.role === "user" ? "user" : "ai",
            content: entry.message,
            created_at: conv.started_at
              ? new Date(new Date(conv.started_at).getTime() + (entry.time_in_call_secs || 0) * 1000).toISOString()
              : new Date().toISOString(),
          }));
        }

        return {
          ...conv,
          status: mappedStatus,
          duration_seconds: realDuration,
          cost_euros: elCost || conv.cost_euros || 0,
          messages,
        };
      });

      const enrichedConversations = await Promise.all(enrichPromises);

      // Fix 2: AWAITED — Recover stuck campaign contacts without conversation_id
      try {
        const { data: stuckContacts } = await supabase
          .from("campaign_contacts")
          .select("id, contact:contacts(phone), campaign:campaign_groups(agent_id)")
          .eq("status", "calling")
          .is("conversation_id", null);

        if (stuckContacts && stuckContacts.length > 0) {
          console.log(`[list-conversations] Found ${stuckContacts.length} stuck campaign contacts (no conversation_id)`);
          for (const stuck of stuckContacts) {
            const phone = (stuck.contact as { phone: string | null } | null)?.phone;
            if (!phone) continue;
            const normalized = normalizePhone(phone);

            const match = enrichedConversations.find((c) =>
              c.caller_phone && normalizePhone(c.caller_phone) === normalized
              && c.call_type === "outbound"
            );

            if (match) {
              const wasAnswered = (match.duration_seconds || 0) > 0;
              const { error: fixErr } = await supabase.from("campaign_contacts").update({
                status: wasAnswered ? "completed" : "no_answer",
                conversation_id: match.id,
                call_duration_seconds: match.duration_seconds || 0,
                cost_euros: match.cost_euros || 0,
              }).eq("id", stuck.id);
              if (fixErr) console.error(`[list-conversations] stuck contact fix error:`, fixErr.message);
              else console.log(`[list-conversations] Fixed stuck contact ${stuck.id} → ${wasAnswered ? "completed" : "no_answer"}`);
            }
          }
        }
      } catch (stuckErr) {
        console.error("[list-conversations] stuck contacts recovery error:", stuckErr);
      }

      // Fix 4: AWAITED — Recalculate campaign stats
      try {
        const { data: affectedCampaigns } = await supabase
          .from("campaign_groups")
          .select("id")
          .in("status", ["running", "paused", "completed"]);

        if (affectedCampaigns) {
          for (const camp of affectedCampaigns) {
            const { data: contactStats } = await supabase
              .from("campaign_contacts")
              .select("status, cost_euros")
              .eq("campaign_id", camp.id);

            if (contactStats) {
              const called = contactStats.filter((c) => c.status !== "pending").length;
              const answered = contactStats.filter((c) => c.status === "completed" || c.status === "answered").length;
              const failed = contactStats.filter((c) => ["failed", "no_answer", "busy"].includes(c.status)).length;
              const totalCost = contactStats.reduce((sum, c) => sum + ((c as { cost_euros?: number }).cost_euros || 0), 0);

              const { error: statsErr } = await supabase.from("campaign_groups").update({
                contacts_called: called,
                contacts_answered: answered,
                contacts_failed: failed,
                cost_euros: totalCost,
              }).eq("id", camp.id);
              if (statsErr) console.error(`[list-conversations] Campaign ${camp.id} stats update error:`, statsErr.message);
              else console.log(`[list-conversations] Campaign ${camp.id} stats: called=${called}, answered=${answered}, failed=${failed}, cost=${totalCost}`);
            }
          }
        }
      } catch (statsErr) {
        console.error("[list-conversations] campaign stats reconcile error:", statsErr);
      }

      return new Response(JSON.stringify({ conversations: enrichedConversations }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ conversations: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[list-conversations] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
