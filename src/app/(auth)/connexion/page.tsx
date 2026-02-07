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
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <Phone size={20} color="white" />
        </div>
        <div className="auth-logo-text">
          Hall<span>Call</span>
        </div>
      </div>

      <h1 className="text-xl font-bold text-center text-slate-900 mb-1">
        Connexion
      </h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Connectez-vous a votre compte HallCall
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

        <div>
          <label className="label">Mot de passe</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field pr-10"
              placeholder="••••••••"
              required
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

        <div className="text-right">
          <Link href="/mot-de-passe-oublie" className="text-[0.8125rem] text-slate-700 no-underline hover:text-slate-900">
            Mot de passe oublie ?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3 text-[0.9375rem]"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      <p className="text-sm text-slate-500 text-center mt-6">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="text-slate-900 font-medium no-underline hover:underline">
          Creer un compte
        </Link>
      </p>
    </div>
  );
}
