import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Validate agent exists
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("elevenlabs_agent_id", agentId)
    .single();

  if (!agent) {
    return NextResponse.json(
      { error: "Agent not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Validate active widget exists
  const { data: widget } = await supabase
    .from("widgets")
    .select("id, is_active, domain_whitelist")
    .eq("agent_id", agent.id)
    .eq("is_active", true)
    .single();

  if (!widget) {
    return NextResponse.json(
      { error: "Widget not active" },
      { status: 403, headers: corsHeaders }
    );
  }

  // Domain whitelist check
  const origin =
    request.headers.get("origin") || request.headers.get("referer");
  if (widget.domain_whitelist?.length > 0 && origin) {
    try {
      const hostname = new URL(origin).hostname;
      const allowed = widget.domain_whitelist.some(
        (d: string) => hostname === d || hostname.endsWith("." + d)
      );
      if (!allowed) {
        return NextResponse.json(
          { error: "Domain not authorized" },
          { status: 403, headers: corsHeaders }
        );
      }
    } catch {
      // Invalid origin URL, skip check
    }
  }

  // Get signed URL from ElevenLabs
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`;

  const elResponse = await fetch(url, {
    headers: { "xi-api-key": apiKey },
  });

  if (!elResponse.ok) {
    const errorText = await elResponse.text();
    return NextResponse.json(
      { error: "ElevenLabs error", details: errorText },
      { status: elResponse.status, headers: corsHeaders }
    );
  }

  const data = await elResponse.json();
  return NextResponse.json(data, { headers: corsHeaders });
}
