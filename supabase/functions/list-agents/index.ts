import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    // Requeter les agents de l'utilisateur depuis Supabase
    const { data: agents, error } = await supabase
      .from("agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Mapper au format Agent compatible avec le frontend
    const mappedAgents = (agents || []).map((a: Record<string, unknown>) => ({
      agent_id: a.elevenlabs_agent_id,
      name: a.name,
      agent_type: (a.agent_type as string) || "standard",
      conversation_config: {
        agent: {
          first_message: a.first_message || "",
          language: a.language || "fr",
          prompt: {
            prompt: a.system_prompt || "",
            llm: a.llm_model || "gpt-4o-mini",
            temperature: a.temperature ?? 0.7,
            max_tokens: -1,
          },
        },
        tts: {
          voice_id: a.voice_id || "",
          model_id: "eleven_turbo_v2_5",
          stability: a.stability ?? 0.5,
          similarity_boost: a.similarity_boost ?? 0.8,
          speed: a.speed ?? 1.0,
        },
        conversation: {
          max_duration_seconds: a.max_duration_seconds ?? 600,
        },
      },
    }));

    return new Response(JSON.stringify({ agents: mappedAgents }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
