"use client";

import { useState } from "react";
import { User, Lock, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

export default function ProfilPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!fullName.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    setSavingProfile(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profil mis a jour");
    } catch {
      toast.error("Erreur lors de la mise a jour du profil");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setSavingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Mot de passe mis a jour");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Erreur lors du changement de mot de passe");
    } finally {
      setSavingPassword(false);
    }
  }

  if (!profile) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 m-0">Mon compte</h1>
        <p className="text-sm text-slate-500 mt-1">Gerez vos informations personnelles</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Profile info */}
      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <User size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 m-0">Informations du profil</h2>
            <p className="text-xs text-slate-500 m-0 mt-0.5">Modifiez votre nom et consultez vos informations</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div>
            <label className="label">Nom complet</label>
            <input
              className="input-field"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Votre nom"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input-field bg-slate-50 text-slate-500"
              value={profile.email}
              disabled
            />
            <p className="text-xs text-slate-400 mt-1">L&apos;email ne peut pas etre modifie</p>
          </div>
          <div>
            <label className="label">Forfait</label>
            <div className="flex items-center gap-2">
              <span className="badge badge-info">{PLAN_LABELS[profile.plan] || profile.plan}</span>
              <span className="text-sm text-slate-500">
                {profile.minutes_used} / {profile.minutes_limit} minutes utilisees
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={savingProfile}>
              <Save size={16} />
              {savingProfile ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>

      {/* Password change */}
      <div className="card self-start">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <Lock size={20} className="text-slate-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 m-0">Changer le mot de passe</h2>
            <p className="text-xs text-slate-500 m-0 mt-0.5">Mettez a jour votre mot de passe de connexion</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div>
            <label className="label">Nouveau mot de passe</label>
            <div className="relative">
              <input
                className="input-field pr-10"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer text-slate-400 p-0"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Confirmer le mot de passe</label>
            <input
              className="input-field"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmez votre mot de passe"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Les mots de passe ne correspondent pas</p>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary flex items-center gap-2"
              disabled={savingPassword || !newPassword || !confirmPassword}
            >
              <Lock size={16} />
              {savingPassword ? "Modification..." : "Changer le mot de passe"}
            </button>
          </div>
        </form>
      </div>

      </div>
    </div>
  );
}
