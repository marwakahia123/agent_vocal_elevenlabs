"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function MotDePasseOubliePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("send-reset-otp", {
        body: { email },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erreur lors de l'envoi");
        return;
      }

      toast.success("Code envoye par email");
      router.push(`/verification?email=${encodeURIComponent(email)}&flow=reset`);
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div style={{
          width: "2.5rem",
          height: "2.5rem",
          borderRadius: "0.75rem",
          background: "linear-gradient(135deg, #F97316, #EA580C)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <Phone size={20} color="white" />
        </div>
        <div className="auth-logo-text">
          Hall<span>Call</span>
        </div>
      </div>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, textAlign: "center", color: "#111827", marginBottom: "0.25rem" }}>
        Mot de passe oublie
      </h1>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", marginBottom: "1.5rem" }}>
        Entrez votre email pour recevoir un code de reinitialisation
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
            placeholder="votre@email.com"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
          style={{ width: "100%", padding: "0.75rem", fontSize: "0.9375rem" }}
        >
          {loading ? "Envoi..." : "Envoyer le code"}
        </button>
      </form>

      <Link
        href="/connexion"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.375rem",
          marginTop: "1rem",
          color: "#6b7280",
          fontSize: "0.875rem",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={14} />
        Retour a la connexion
      </Link>
    </div>
  );
}
