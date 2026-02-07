import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const { action } = body;
    console.log("[save-conversation] action:", action, "user:", user.id, "body:", JSON.stringify(body));

    if (action === "start") {
      const { elevenlabsAgentId } = body;
      if (!elevenlabsAgentId) {
        console.log("[save-conversation] ERROR: missing elevenlabsAgentId");
        return new Response(JSON.stringify({ error: "elevenlabsAgentId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Trouver l'agent en base
      const { data: agent, error: agentError } = await supabase
        .from("agents")
        .select("id")
        .eq("elevenlabs_agent_id", elevenlabsAgentId)
        .single();

      console.log("[save-conversation] agent lookup:", agent?.id || "NOT FOUND", "error:", agentError?.message || "none");

      const { data, error } = await supabase.from("conversations").insert({
        user_id: user.id,
        agent_id: agent?.id || null,
        elevenlabs_agent_id: elevenlabsAgentId,
        status: "active",
        call_type: "test",
      }).select().single();

      console.log("[save-conversation] insert result:", data?.id || "FAILED", "error:", error?.message || "none");

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "end") {
      const { conversationId } = body;
      if (!conversationId) {
        return new Response(JSON.stringify({ error: "conversationId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculer la duree - filtrer par user_id
      const { data: conv } = await supabase
        .from("conversations")
        .select("started_at")
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .single();

      const durationSeconds = conv
        ? Math.round((Date.now() - new Date(conv.started_at).getTime()) / 1000)
        : 0;

      const { data, error } = await supabase
        .from("conversations")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'start' or 'end'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
