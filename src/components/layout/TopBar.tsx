"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Search, LogOut, User } from "lucide-react";
import { getInitials } from "@/lib/utils";

export default function TopBar() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSignOut = async () => {
    setShowMenu(false);
    await signOut();
    router.push("/connexion");
  };

  return (
    <header className="topbar">
      <div className="flex items-center gap-4 flex-1">
        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 max-w-[400px] flex-1">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            className="border-none bg-transparent outline-none text-sm text-slate-700 w-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg border-none bg-transparent cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <Bell size={20} />
        </button>

        {/* User menu */}
        {profile && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 border-none bg-transparent cursor-pointer p-1 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center text-xs font-semibold">
                {getInitials(profile.full_name || profile.email)}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[0.8125rem] font-medium text-slate-900">
                  {profile.full_name || "Utilisateur"}
                </span>
                <span className="text-[0.6875rem] text-slate-400">
                  {profile.plan === "free" ? "Plan Gratuit" : profile.plan}
                </span>
              </div>
            </button>

            {showMenu && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] bg-white rounded-lg shadow-lg border border-slate-200 min-w-[200px] z-[100] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="text-[0.8125rem] font-medium text-slate-900">{profile.full_name || "Utilisateur"}</div>
                  <div className="text-xs text-slate-400">{profile.email}</div>
                </div>
                <button
                  onClick={() => { setShowMenu(false); router.push("/abonnement"); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 border-none bg-transparent cursor-pointer text-[0.8125rem] text-slate-700 text-left hover:bg-slate-50 transition-colors"
                >
                  <User size={16} className="text-slate-500" />
                  Mon compte
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 w-full px-4 py-2.5 border-none bg-transparent cursor-pointer text-[0.8125rem] text-red-500 text-left border-t border-slate-100 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={16} />
                  Deconnexion
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
