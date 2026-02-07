import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const body = await req.json();
    const { agentId } = body;

    if (!agentId) {
      return new Response(JSON.stringify({ error: "agentId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifier que l'agent appartient a l'utilisateur
    const { data: agentRecord } = await supabase
      .from("agents")
      .select("id")
      .eq("elevenlabs_agent_id", agentId)
      .eq("user_id", user.id)
      .single();

    if (!agentRecord) {
      return new Response(JSON.stringify({ error: "Agent introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Construire le payload ElevenLabs
    const updateBody: Record<string, unknown> = {};

    if (body.conversation_config) {
      updateBody.conversation_config = body.conversation_config;
    } else if (body.name || body.systemPrompt || body.firstMessage || body.voiceId || body.language) {
      // Mode formulaire : construire la config complete
      updateBody.conversation_config = {
        agent: {
          prompt: {
            prompt: body.systemPrompt ?? "",
            llm: body.llmModel ?? "gpt-4o-mini",
            temperature: body.temperature ?? 0.7,
            max_tokens: -1,
          },
          first_message: body.firstMessage ?? "",
          language: body.language ?? "fr",
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
      };
    } else {
      // Default: fix text_only
      updateBody.conversation_config = {
        conversation: { text_only: false },
      };
    }

    if (body.name) {
      updateBody.name = body.name;
    }

    // Mettre a jour ElevenLabs
    const res = await fetch(`${ELEVENLABS_API_BASE}/v1/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return new Response(JSON.stringify({ error: `ElevenLabs API error: ${res.status}`, details: errorText }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Synchroniser la table Supabase
    const supabaseUpdate: Record<string, unknown> = {};
    if (body.name) supabaseUpdate.name = body.name;
    if (body.systemPrompt !== undefined) supabaseUpdate.system_prompt = body.systemPrompt;
    if (body.firstMessage !== undefined) supabaseUpdate.first_message = body.firstMessage;
    if (body.language) supabaseUpdate.language = body.language;
    if (body.voiceId) supabaseUpdate.voice_id = body.voiceId;
    if (body.llmModel) supabaseUpdate.llm_model = body.llmModel;
    if (body.temperature !== undefined) supabaseUpdate.temperature = body.temperature;
    if (body.stability !== undefined) supabaseUpdate.stability = body.stability;
    if (body.similarityBoost !== undefined) supabaseUpdate.similarity_boost = body.similarityBoost;
    if (body.speed !== undefined) supabaseUpdate.speed = body.speed;
    if (body.maxDurationSeconds !== undefined) supabaseUpdate.max_duration_seconds = body.maxDurationSeconds;

    if (Object.keys(supabaseUpdate).length > 0) {
      await supabase
        .from("agents")
        .update(supabaseUpdate)
        .eq("elevenlabs_agent_id", agentId)
        .eq("user_id", user.id);
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
