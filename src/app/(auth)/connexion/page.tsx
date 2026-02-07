"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        toast.error(error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect"
          : error.message);
        return;
      }

      toast.success("Connexion reussie !");
      router.push("/");
      router.refresh();
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
        Connexion
      </h1>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", marginBottom: "1.5rem" }}>
        Connectez-vous a votre compte HallCall
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

        <div>
          <label className="label">Mot de passe</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
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

        <div style={{ textAlign: "right" }}>
          <Link href="/mot-de-passe-oublie" style={{ fontSize: "0.8125rem", color: "#F97316", textDecoration: "none" }}>
            Mot de passe oublie ?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
          style={{ width: "100%", padding: "0.75rem", fontSize: "0.9375rem" }}
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", marginTop: "1.5rem" }}>
        Pas encore de compte ?{" "}
        <Link href="/inscription" style={{ color: "#F97316", fontWeight: 500, textDecoration: "none" }}>
          Creer un compte
        </Link>
      </p>
    </div>
  );
}
