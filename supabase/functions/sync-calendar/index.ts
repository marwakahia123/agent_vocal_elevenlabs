import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function refreshGoogleToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Failed to refresh Google token");
  const data = await res.json();
  await supabase
    .from("integrations")
    .update({
      access_token: data.access_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google");
  return data.access_token;
}

async function refreshMicrosoftToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("MICROSOFT_CLIENT_ID")!,
        client_secret: Deno.env.get("MICROSOFT_CLIENT_SECRET")!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }
  );
  if (!res.ok) throw new Error("Failed to refresh Microsoft token");
  const data = await res.json();
  await supabase
    .from("integrations")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "microsoft");
  return data.access_token;
}

interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  location?: string;
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
    const { action, event } = body as { action: "list" | "create"; event?: CalendarEvent };

    // Find active calendar integration
    const { data: integrations } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("provider", ["google", "microsoft"]);

    const integration = integrations?.[0] as Record<string, unknown> | undefined;

    if (!integration) {
      return new Response(
        JSON.stringify({ error: "Aucune integration calendrier active. Connectez Google ou Microsoft." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = integration.provider as string;
    let accessToken = integration.access_token as string;
    const tokenExpiry = new Date(integration.token_expires_at as string);

    // Refresh token if expired
    if (tokenExpiry < new Date()) {
      const refreshToken = integration.refresh_token as string;
      if (provider === "google") {
        accessToken = await refreshGoogleToken(supabase, user.id, refreshToken);
      } else {
        accessToken = await refreshMicrosoftToken(supabase, user.id, refreshToken);
      }
    }

    if (action === "list") {
      // Fetch events from the next 30 days
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      let events: CalendarEvent[] = [];

      if (provider === "google") {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${future}&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) throw new Error(`Google Calendar error: ${res.status}`);
        const data = await res.json();
        events = (data.items || []).map((item: Record<string, unknown>) => ({
          id: item.id,
          title: item.summary || "",
          description: item.description || "",
          start_at: (item.start as Record<string, string>)?.dateTime || (item.start as Record<string, string>)?.date || "",
          end_at: (item.end as Record<string, string>)?.dateTime || (item.end as Record<string, string>)?.date || "",
          location: item.location || "",
        }));
      } else {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now}&endDateTime=${future}&$orderby=start/dateTime`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) throw new Error(`Microsoft Calendar error: ${res.status}`);
        const data = await res.json();
        events = (data.value || []).map((item: Record<string, unknown>) => ({
          id: item.id,
          title: item.subject || "",
          description: (item.body as Record<string, string>)?.content || "",
          start_at: (item.start as Record<string, string>)?.dateTime || "",
          end_at: (item.end as Record<string, string>)?.dateTime || "",
          location: (item.location as Record<string, string>)?.displayName || "",
        }));
      }

      return new Response(JSON.stringify({ events }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create" && event) {
      let externalEventId: string | null = null;

      if (provider === "google") {
        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              summary: event.title,
              description: event.description || "",
              location: event.location || "",
              start: { dateTime: event.start_at },
              end: { dateTime: event.end_at },
            }),
          }
        );
        if (!res.ok) throw new Error(`Google Calendar create error: ${res.status}`);
        const data = await res.json();
        externalEventId = data.id;
      } else {
        const res = await fetch(
          "https://graph.microsoft.com/v1.0/me/events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              subject: event.title,
              body: { contentType: "HTML", content: event.description || "" },
              start: { dateTime: event.start_at, timeZone: "Europe/Paris" },
              end: { dateTime: event.end_at, timeZone: "Europe/Paris" },
              location: { displayName: event.location || "" },
            }),
          }
        );
        if (!res.ok) throw new Error(`Microsoft Calendar create error: ${res.status}`);
        const data = await res.json();
        externalEventId = data.id;
      }

      // Also save in local appointments table
      await supabase.from("appointments").insert({
        user_id: user.id,
        title: event.title,
        description: event.description || "",
        start_at: event.start_at,
        end_at: event.end_at,
        location: event.location || "",
        status: "scheduled",
        external_calendar_id: provider,
        external_event_id: externalEventId,
      });

      return new Response(
        JSON.stringify({ success: true, externalEventId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Action invalide. Utilisez 'list' ou 'create'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
