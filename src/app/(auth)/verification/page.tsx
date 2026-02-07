"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

function VerificationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const flow = searchParams.get("flow") || "signup";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);
    if (pasted.length >= 6) {
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      toast.error("Veuillez entrer le code complet");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      if (flow === "signup") {
        const password = sessionStorage.getItem("signup_password");
        if (!password) {
          toast.error("Session expiree, veuillez recommencer l'inscription");
          router.push("/inscription");
          return;
        }

        const { data, error } = await supabase.functions.invoke("verify-signup", {
          body: { email, code: fullCode, password },
        });

        if (error || data?.error) {
          toast.error(data?.error || "Code invalide");
          return;
        }

        sessionStorage.removeItem("signup_password");

        // Auto-login
        await supabase.auth.signInWithPassword({ email, password });
        toast.success("Compte cree avec succes !");
        router.push("/");
        router.refresh();
      } else {
        // Reset flow - redirect to reset page with code
        router.push(`/reinitialiser?email=${encodeURIComponent(email)}&code=${fullCode}`);
      }
    } catch {
      toast.error("Erreur de verification");
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
        Verification
      </h1>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", marginBottom: "1.5rem" }}>
        Entrez le code a 6 chiffres envoye a<br />
        <strong style={{ color: "#111827" }}>{email}</strong>
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div className="otp-container" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="otp-input"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || code.join("").length !== 6}
          className="btn-primary"
          style={{ width: "100%", padding: "0.75rem", fontSize: "0.9375rem" }}
        >
          {loading ? "Verification..." : "Verifier"}
        </button>
      </form>

      <button
        onClick={() => router.back()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.375rem",
          width: "100%",
          marginTop: "1rem",
          border: "none",
          background: "none",
          color: "#6b7280",
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={14} />
        Retour
      </button>
    </div>
  );
}

export default function VerificationPage() {
  return (
    <Suspense fallback={
      <div className="auth-card" style={{ textAlign: "center", padding: "3rem" }}>
        <div style={{ width: "2rem", height: "2rem", border: "3px solid #FFEDD5", borderTopColor: "#F97316", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" }} />
      </div>
    }>
      <VerificationContent />
    </Suspense>
  );
}
