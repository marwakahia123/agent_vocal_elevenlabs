import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Microsoft OAuth redirects via GET with ?code=...&state=...
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const appUrl = Deno.env.get("APP_URL") || "http://localhost:3005";

    if (error) {
      return Response.redirect(`${appUrl}/integrations?error=${error}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${appUrl}/integrations?error=missing_params`, 302);
    }

    // Decode state to get user_id
    let userId: string;
    try {
      const decoded = JSON.parse(atob(state));
      userId = decoded.userId;
    } catch {
      return Response.redirect(`${appUrl}/integrations?error=invalid_state`, 302);
    }

    const clientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
    const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${supabaseUrl}/functions/v1/microsoft-auth-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("Microsoft token exchange error:", errorText);
      return Response.redirect(`${appUrl}/integrations?error=token_exchange`, 302);
    }

    const tokens = await tokenRes.json();

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Upsert integration
    const { error: dbError } = await supabase
      .from("integrations")
      .upsert(
        {
          user_id: userId,
          provider: "microsoft",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: expiresAt,
          scopes: tokens.scope ? tokens.scope.split(" ") : [],
          is_active: true,
        },
        { onConflict: "user_id,provider" }
      );

    if (dbError) {
      console.error("DB upsert error:", dbError);
      return Response.redirect(`${appUrl}/integrations?error=db_error`, 302);
    }

    return Response.redirect(`${appUrl}/integrations?connected=microsoft`, 302);
  } catch (error) {
    console.error("Microsoft callback error:", error);
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:3005";
    return Response.redirect(`${appUrl}/integrations?error=unknown`, 302);
  }
});
