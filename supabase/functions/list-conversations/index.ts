import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

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
    console.log(`[list-conversations] EL metadata for ${conversationId}:`, JSON.stringify(data.metadata));
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
        call_type,
        caller_phone,
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
    // Fetch details from ElevenLabs API (duration, transcript, status)
    if (apiKey) {
      const enrichPromises = data.map(async (conv) => {
        if (!conv.elevenlabs_conversation_id) return conv;

        const elData = await fetchElevenLabsConversation(apiKey, conv.elevenlabs_conversation_id);
        if (!elData) return conv;

        console.log(`[list-conversations] EL data for ${conv.elevenlabs_conversation_id}: status=${elData.status}, transcript=${elData.transcript?.length || 0} entries`);

        // Calculate real duration from metadata (ElevenLabs nests duration in metadata)
        let realDuration = conv.duration_seconds;
        const meta = elData.metadata;
        if (meta?.call_duration_secs) {
          realDuration = Math.round(meta.call_duration_secs);
        } else if (elData.transcript && elData.transcript.length > 0) {
          // Fallback: use last transcript entry's time_in_call_secs
          const lastEntry = elData.transcript[elData.transcript.length - 1];
          if (lastEntry.time_in_call_secs) {
            realDuration = Math.round(lastEntry.time_in_call_secs);
          }
        }

        // Map ElevenLabs status to our status
        const elStatus = elData.status;
        let mappedStatus = conv.status;
        if (elStatus === "done" || elStatus === "ended") {
          mappedStatus = "ended";
        } else if (elStatus === "failed" || elStatus === "error") {
          mappedStatus = "error";
        }

        // Update DB if data changed (async, don't block response)
        const needsUpdate =
          (realDuration !== conv.duration_seconds) ||
          (mappedStatus !== conv.status && conv.status === "active");

        if (needsUpdate) {
          const updateData: Record<string, unknown> = {};
          if (realDuration !== conv.duration_seconds) {
            updateData.duration_seconds = realDuration;
          }
          if (mappedStatus !== conv.status && conv.status === "active") {
            updateData.status = mappedStatus;
            if (!conv.ended_at && meta?.start_time_unix_secs && meta?.call_duration_secs) {
              updateData.ended_at = new Date((meta.start_time_unix_secs + meta.call_duration_secs) * 1000).toISOString();
            }
          }
          // Fire and forget — don't block the response
          supabase.from("conversations").update(updateData).eq("id", conv.id).then(
            ({ error: upErr }) => {
              if (upErr) console.error(`[list-conversations] DB update error for ${conv.id}:`, upErr.message);
              else console.log(`[list-conversations] DB updated for ${conv.id}:`, updateData);
            }
          );
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
          messages,
        };
      });

      const enrichedConversations = await Promise.all(enrichPromises);

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
