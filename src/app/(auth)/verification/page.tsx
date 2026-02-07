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
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <Phone size={20} color="white" />
        </div>
        <div className="auth-logo-text">
          Hall<span>Call</span>
        </div>
      </div>

      <h1 className="text-xl font-bold text-center text-slate-900 mb-1">
        Verification
      </h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Entrez le code a 6 chiffres envoye a<br />
        <strong className="text-slate-900">{email}</strong>
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
          className="btn-primary w-full py-3 text-[0.9375rem]"
        >
          {loading ? "Verification..." : "Verifier"}
        </button>
      </form>

      <button
        onClick={() => router.back()}
        className="flex items-center justify-center gap-1.5 w-full mt-4 border-none bg-transparent text-slate-500 text-sm cursor-pointer hover:text-slate-900 transition-colors"
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
      <div className="auth-card text-center p-12">
        <div className="spinner mx-auto" />
      </div>
    }>
      <VerificationContent />
    </Suspense>
  );
}
