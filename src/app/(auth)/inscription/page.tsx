"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function InscriptionPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("send-signup-otp", {
        body: { email, fullName, password },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Erreur lors de l'envoi du code");
        return;
      }

      toast.success("Code de verification envoye !");
      // Store password in sessionStorage for verification step
      sessionStorage.setItem("signup_password", password);
      router.push(`/verification?email=${encodeURIComponent(email)}&flow=signup`);
    } catch {
      toast.error("Erreur de connexion au serveur");
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
        Creer un compte
      </h1>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", marginBottom: "1.5rem" }}>
        Inscrivez-vous pour commencer avec HallCall
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="label">Nom complet</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input-field"
            placeholder="Jean Dupont"
            required
          />
        </div>

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

        <div>
          <label className="label">Mot de passe</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Minimum 6 caracteres"
              required
              minLength={6}
              style={{ paddingRight: "2.5rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "0.5rem",
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "#9ca3af",
                padding: "0.25rem",
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
          style={{ width: "100%", padding: "0.75rem", fontSize: "0.9375rem" }}
        >
          {loading ? "Envoi du code..." : "S'inscrire"}
        </button>
      </form>

      <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", marginTop: "1.5rem" }}>
        Deja un compte ?{" "}
        <Link href="/connexion" style={{ color: "#F97316", fontWeight: 500, textDecoration: "none" }}>
          Se connecter
        </Link>
      </p>
    </div>
  );
}
