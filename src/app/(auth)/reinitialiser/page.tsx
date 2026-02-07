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
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <Phone size={20} color="white" />
        </div>
        <div className="auth-logo-text">
          Hall<span>Call</span>
        </div>
      </div>

      <h1 className="text-xl font-bold text-center text-slate-900 mb-1">
        Nouveau mot de passe
      </h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Choisissez un nouveau mot de passe pour<br />
        <strong className="text-slate-900">{email}</strong>
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label">Nouveau mot de passe</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
          className="btn-primary w-full py-3 text-[0.9375rem]"
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
      <div className="auth-card text-center p-12">
        <div className="spinner mx-auto" />
      </div>
    }>
      <ReinitialiserContent />
    </Suspense>
  );
}
