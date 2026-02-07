import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verifier l'authentification
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorise" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const agentId = formData.get("agentId") as string;
    const file = formData.get("file") as File | null;
    const url = formData.get("url") as string | null;

    if (!agentId) {
      return new Response(
        JSON.stringify({ error: "agentId est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!file && !url) {
      return new Response(
        JSON.stringify({ error: "Un fichier ou une URL est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verifier que l'agent appartient a l'utilisateur
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, elevenlabs_agent_id")
      .eq("elevenlabs_agent_id", agentId)
      .eq("user_id", user.id)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent non trouve ou non autorise" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let docId: string;
    let docName: string;
    let fileName: string;
    let fileType: string;
    let fileSize: number | null = null;

    if (file) {
      // Etape 1: Upload le fichier vers la KB ElevenLabs
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("name", file.name);

      const uploadRes = await fetch(
        `${ELEVENLABS_API_BASE}/v1/convai/knowledge-base/file`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body: uploadForm,
        }
      );

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        return new Response(
          JSON.stringify({
            error: `ElevenLabs upload error: ${uploadRes.status}`,
            details: errorText,
          }),
          { status: uploadRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const uploadData = await uploadRes.json();
      docId = uploadData.id;
      docName = uploadData.name || file.name;
      fileName = file.name;
      fileType = file.name.endsWith(".pdf") ? "pdf" : "txt";
      fileSize = file.size;
    } else {
      // Etape 1: Creer un doc KB depuis une URL
      const urlRes = await fetch(
        `${ELEVENLABS_API_BASE}/v1/convai/knowledge-base/url`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: url!, name: url! }),
        }
      );

      if (!urlRes.ok) {
        const errorText = await urlRes.text();
        return new Response(
          JSON.stringify({
            error: `ElevenLabs URL error: ${urlRes.status}`,
            details: errorText,
          }),
          { status: urlRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const urlData = await urlRes.json();
      docId = urlData.id;
      docName = urlData.name || url!;
      fileName = url!;
      fileType = "url";
    }

    // Etape 2: Recuperer la config actuelle de l'agent pour les KB existants
    const getAgentRes = await fetch(
      `${ELEVENLABS_API_BASE}/v1/convai/agents/${agentId}`,
      {
        headers: { "xi-api-key": apiKey },
      }
    );

    let existingKb: Array<Record<string, unknown>> = [];
    if (getAgentRes.ok) {
      const agentConfig = await getAgentRes.json();
      existingKb =
        agentConfig?.conversation_config?.agent?.prompt?.knowledge_base || [];
    }

    // Etape 3: Attacher le document a l'agent
    const newKbEntry = {
      type: fileType === "url" ? "url" : "file",
      id: docId,
      name: docName,
      usage_mode: "auto",
    };

    const patchRes = await fetch(
      `${ELEVENLABS_API_BASE}/v1/convai/agents/${agentId}`,
      {
        method: "PATCH",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_config: {
            agent: {
              prompt: {
                knowledge_base: [...existingKb, newKbEntry],
              },
            },
          },
        }),
      }
    );

    if (!patchRes.ok) {
      const errorText = await patchRes.text();
      return new Response(
        JSON.stringify({
          error: `ElevenLabs agent update error: ${patchRes.status}`,
          details: errorText,
        }),
        { status: patchRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Etape 4: Sauvegarder dans la base de donnees locale
    const { data: kbItem, error: insertError } = await supabase
      .from("knowledge_base_items")
      .insert({
        user_id: user.id,
        agent_id: agent.id,
        elevenlabs_agent_id: agentId,
        file_name: fileName,
        file_type: fileType,
        file_size_bytes: fileSize,
        elevenlabs_doc_id: docId,
        status: "ready",
        url: url || null,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Erreur lors de la sauvegarde", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(kbItem), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
