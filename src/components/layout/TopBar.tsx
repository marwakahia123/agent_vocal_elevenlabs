"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Search, LogOut, Settings, User } from "lucide-react";
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
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1 }}>
        {/* Search */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          backgroundColor: "#f3f4f6",
          borderRadius: "0.5rem",
          padding: "0.5rem 0.75rem",
          maxWidth: "400px",
          flex: 1,
        }}>
          <Search size={16} style={{ color: "#9ca3af" }} />
          <input
            type="text"
            placeholder="Rechercher..."
            style={{
              border: "none",
              background: "none",
              outline: "none",
              fontSize: "0.875rem",
              color: "#374151",
              width: "100%",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {/* Notifications */}
        <button style={{
          position: "relative",
          padding: "0.5rem",
          borderRadius: "0.5rem",
          border: "none",
          background: "none",
          cursor: "pointer",
          color: "#6b7280",
        }}>
          <Bell size={20} />
        </button>

        {/* User menu */}
        {profile && (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: "0.25rem",
                borderRadius: "0.5rem",
              }}
            >
              <div style={{
                width: "2rem",
                height: "2rem",
                borderRadius: "50%",
                backgroundColor: "#FFF7ED",
                color: "#EA580C",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}>
                {getInitials(profile.full_name || profile.email)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#111827" }}>
                  {profile.full_name || "Utilisateur"}
                </span>
                <span style={{ fontSize: "0.6875rem", color: "#9ca3af" }}>
                  {profile.plan === "free" ? "Plan Gratuit" : profile.plan}
                </span>
              </div>
            </button>

            {showMenu && (
              <div style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 0.5rem)",
                backgroundColor: "white",
                borderRadius: "0.5rem",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                border: "1px solid #e5e7eb",
                minWidth: "200px",
                zIndex: 100,
                overflow: "hidden",
              }}>
                <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#111827" }}>{profile.full_name || "Utilisateur"}</div>
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{profile.email}</div>
                </div>
                <button
                  onClick={() => { setShowMenu(false); router.push("/abonnement"); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "100%",
                    padding: "0.625rem 1rem",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    color: "#374151",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f9fafb")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <User size={16} style={{ color: "#6b7280" }} />
                  Mon compte
                </button>
                <button
                  onClick={handleSignOut}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "100%",
                    padding: "0.625rem 1rem",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    color: "#ef4444",
                    textAlign: "left",
                    borderTop: "1px solid #f3f4f6",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FEF2F2")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
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
