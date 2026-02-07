"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

function ReinitialiserContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const code = searchParams.get("code") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caracteres");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("verify-reset-code", {
        body: { email, code, newPassword },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erreur lors de la reinitialisation");
        return;
      }

      toast.success("Mot de passe modifie avec succes !");
      router.push("/connexion");
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
        Nouveau mot de passe
      </h1>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", marginBottom: "1.5rem" }}>
        Choisissez un nouveau mot de passe pour<br />
        <strong style={{ color: "#111827" }}>{email}</strong>
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label className="label">Nouveau mot de passe</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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

        <div>
          <label className="label">Confirmer le mot de passe</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field"
            placeholder="Retapez le mot de passe"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
          style={{ width: "100%", padding: "0.75rem", fontSize: "0.9375rem" }}
        >
          {loading ? "Modification..." : "Changer le mot de passe"}
        </button>
      </form>
    </div>
  );
}

export default function ReinitialiserPage() {
  return (
    <Suspense fallback={
      <div className="auth-card" style={{ textAlign: "center", padding: "3rem" }}>
        <div style={{ width: "2rem", height: "2rem", border: "3px solid #FFEDD5", borderTopColor: "#F97316", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" }} />
      </div>
    }>
      <ReinitialiserContent />
    </Suspense>
  );
}
