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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find agent by elevenlabs_agent_id
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

  // Find active widget for this agent
  const { data: widget } = await supabase
    .from("widgets")
    .select("config, is_active, domain_whitelist, name")
    .eq("agent_id", agent.id)
    .eq("is_active", true)
    .single();

  if (!widget) {
    return NextResponse.json(
      { error: "No active widget for this agent" },
      { status: 404, headers: corsHeaders }
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

  return NextResponse.json(
    { config: widget.config, name: widget.name },
    { headers: corsHeaders }
  );
}
