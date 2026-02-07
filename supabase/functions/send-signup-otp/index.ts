import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, fullName, password } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email et mot de passe requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const userExists = existingUsers?.users?.some((u: { email?: string }) => u.email === email);
    if (userExists) {
      return new Response(JSON.stringify({ error: "Un compte avec cet email existe deja" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash password for storage
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedPassword = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Invalidate old codes
    await supabase
      .from("signup_verification_codes")
      .update({ used: true })
      .eq("email", email)
      .eq("used", false);

    // Store new code (expires in 10 minutes)
    const { error: insertError } = await supabase
      .from("signup_verification_codes")
      .insert({
        email,
        code,
        full_name: fullName || "",
        hashed_password: hashedPassword,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Erreur interne" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HallCall <noreply@hallcall.fr>",
          to: [email],
          subject: `Votre code de verification HallCall: ${code}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
              <h2 style="color: #F97316;">HallCall</h2>
              <p>Bonjour${fullName ? ` ${fullName}` : ""},</p>
              <p>Votre code de verification est :</p>
              <div style="background: #FFF7ED; border: 2px solid #F97316; border-radius: 8px; padding: 1.5rem; text-align: center; margin: 1.5rem 0;">
                <span style="font-size: 2rem; font-weight: bold; letter-spacing: 0.5rem; color: #EA580C;">${code}</span>
              </div>
              <p style="color: #6b7280; font-size: 0.875rem;">Ce code expire dans 10 minutes.</p>
              <p style="color: #9ca3af; font-size: 0.75rem;">Si vous n'avez pas demande ce code, ignorez cet email.</p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error("Resend error:", errBody);
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Code envoye" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
