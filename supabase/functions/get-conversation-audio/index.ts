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

    // Verify authentication
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorise" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { elevenlabsConversationId } = await req.json();
    if (!elevenlabsConversationId) {
      return new Response(JSON.stringify({ error: "elevenlabsConversationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the conversation belongs to this user
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("elevenlabs_conversation_id", elevenlabsConversationId)
      .eq("user_id", user.id)
      .single();

    if (!conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch audio from ElevenLabs
    const audioRes = await fetch(
      `${ELEVENLABS_API_BASE}/v1/convai/conversations/${elevenlabsConversationId}/audio`,
      { headers: { "xi-api-key": apiKey } }
    );

    if (!audioRes.ok) {
      const errText = await audioRes.text();
      console.error("[get-conversation-audio] ElevenLabs error:", audioRes.status, errText);
      return new Response(JSON.stringify({ error: "Audio not available", status: audioRes.status }), {
        status: audioRes.status === 404 ? 404 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream the audio back to the client
    const audioData = await audioRes.arrayBuffer();
    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        "Content-Type": audioRes.headers.get("Content-Type") || "audio/mpeg",
        "Content-Length": audioData.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("[get-conversation-audio] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
