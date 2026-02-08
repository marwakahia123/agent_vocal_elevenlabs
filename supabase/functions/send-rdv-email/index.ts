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
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;

  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
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

function buildEmailHtml(params: {
  client_name: string;
  date: string;
  time: string;
  duration_minutes: number;
  motif: string;
  meeting_link?: string | null;
}): string {
  const meetingLinkRow = params.meeting_link
    ? `<tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Reunion en ligne</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">
          <a href="${params.meeting_link}" style="color: #3b82f6; text-decoration: none;">Rejoindre la reunion</a>
        </td>
      </tr>`
    : "";

  const meetingButton = params.meeting_link
    ? `<div style="text-align: center; margin: 20px 0;">
        <a href="${params.meeting_link}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">Rejoindre la reunion en ligne</a>
      </div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
  <div style="background: #0f172a; color: white; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 22px;">Confirmation de rendez-vous</h1>
  </div>
  <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
    <p>Bonjour <strong>${params.client_name}</strong>,</p>
    <p>Votre rendez-vous a bien ete confirme. Voici les details :</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 140px;">Date</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${params.date}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Heure</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${params.time}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Duree</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${params.duration_minutes} minutes</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Motif</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${params.motif}</td>
      </tr>
      ${meetingLinkRow}
    </table>
    ${meetingButton}
    <p style="color: #64748b; font-size: 14px;">Si vous souhaitez modifier ou annuler votre rendez-vous, veuillez nous contacter.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
    <p style="color: #94a3b8; font-size: 12px; text-align: center;">Ce message a ete envoye automatiquement par HallCall.</p>
  </div>
</body>
</html>`.trim();
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

    const body = await req.json();
    const { user_id, to, client_name, date, time, duration_minutes, motif, meeting_link } = body;

    if (!user_id || !to || !client_name || !date || !time) {
      return new Response(
        JSON.stringify({ error: "Champs requis: user_id, to, client_name, date, time" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = `Confirmation de votre rendez-vous - ${date} a ${time}`;
    const html = buildEmailHtml({
      client_name,
      date,
      time,
      duration_minutes: duration_minutes || 20,
      motif: motif || "Rendez-vous",
      meeting_link: meeting_link || null,
    });

    // Find user's active email integration
    const { data: integrations } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const googleInt = integrations?.find((i: Record<string, unknown>) => i.provider === "google");
    const microsoftInt = integrations?.find((i: Record<string, unknown>) => i.provider === "microsoft");

    if (googleInt) {
      let accessToken = googleInt.access_token as string;
      const tokenExpiry = new Date(googleInt.token_expires_at as string);
      if (tokenExpiry < new Date()) {
        accessToken = await refreshGoogleToken(supabase, user_id, googleInt.refresh_token as string);
      }
      // Send via Gmail
      const email = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        html,
      ].join("\r\n");

      const encodedEmail = btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encodedEmail }),
        }
      );
      if (!res.ok) throw new Error(`Gmail error: ${res.status}`);
    } else if (microsoftInt) {
      let accessToken = microsoftInt.access_token as string;
      const tokenExpiry = new Date(microsoftInt.token_expires_at as string);
      if (tokenExpiry < new Date()) {
        accessToken = await refreshMicrosoftToken(supabase, user_id, microsoftInt.refresh_token as string);
      }
      const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "HTML", content: html },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        }),
      });
      if (!res.ok) throw new Error(`Microsoft Graph error: ${res.status}`);
    } else {
      // Fallback to Resend
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) throw new Error("No email integration active and RESEND_API_KEY not configured");

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HallCall <noreply@hallcall.com>",
          to: [to],
          subject,
          html,
        }),
      });
      if (!res.ok) throw new Error(`Resend error: ${res.status}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
