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

    const apiBody = {
      name: body.name,
      conversation_config: {
        agent: {
          prompt: {
            prompt: body.systemPrompt || "",
            llm: body.llmModel || "gpt-4o-mini",
            temperature: body.temperature ?? 0.7,
            max_tokens: -1,
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
      return new Response(JSON.stringify({ error: `ElevenLabs API error: ${res.status}`, details: errorText }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();

    // Sauvegarder l'agent dans la base Supabase avec user_id
    await supabase.from("agents").insert({
      user_id: user.id,
      elevenlabs_agent_id: data.agent_id,
      name: body.name,
      system_prompt: body.systemPrompt || "",
      first_message: body.firstMessage || "",
      language: body.language || "fr",
      voice_id: body.voiceId,
      llm_model: body.llmModel || "gpt-4o-mini",
      temperature: body.temperature ?? 0.7,
      stability: body.stability ?? 0.5,
      similarity_boost: body.similarityBoost ?? 0.8,
      speed: body.speed ?? 1.0,
      max_duration_seconds: body.maxDurationSeconds ?? 600,
    });

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
