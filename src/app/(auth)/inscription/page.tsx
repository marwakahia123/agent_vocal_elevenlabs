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
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <Phone size={20} color="white" />
        </div>
        <div className="auth-logo-text">
          Hall<span>Call</span>
        </div>
      </div>

      <h1 className="text-xl font-bold text-center text-slate-900 mb-1">
        Creer un compte
      </h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Inscrivez-vous pour commencer avec HallCall
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field pr-10"
              placeholder="Minimum 6 caracteres"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer text-slate-400 p-1"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3 text-[0.9375rem]"
        >
          {loading ? "Envoi du code..." : "S'inscrire"}
        </button>
      </form>

      <p className="text-sm text-slate-500 text-center mt-6">
        Deja un compte ?{" "}
        <Link href="/connexion" className="text-slate-900 font-medium no-underline hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
