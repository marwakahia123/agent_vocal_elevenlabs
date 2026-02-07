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
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <Phone size={20} color="white" />
        </div>
        <div className="auth-logo-text">
          Hall<span>Call</span>
        </div>
      </div>

      <h1 className="text-xl font-bold text-center text-slate-900 mb-1">
        Mot de passe oublie
      </h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Entrez votre email pour recevoir un code de reinitialisation
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          className="btn-primary w-full py-3 text-[0.9375rem]"
        >
          {loading ? "Envoi..." : "Envoyer le code"}
        </button>
      </form>

      <Link
        href="/connexion"
        className="flex items-center justify-center gap-1.5 mt-4 text-slate-500 text-sm no-underline hover:text-slate-900 transition-colors"
      >
        <ArrowLeft size={14} />
        Retour a la connexion
      </Link>
    </div>
  );
}
