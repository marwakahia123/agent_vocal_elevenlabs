"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Bot,
  Phone,
  Code2,
  Puzzle,
  History,
  Users,
  Megaphone,
  Calendar,
  Ticket,
  MessageSquare,
  CreditCard,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: "Configurer",
    items: [
      { label: "Tableau de bord", href: "/", icon: <LayoutDashboard size={18} /> },
      { label: "Agents", href: "/agents", icon: <Bot size={18} /> },
      { label: "Numeros", href: "/numeros", icon: <Phone size={18} /> },
      { label: "Widgets", href: "/widgets", icon: <Code2 size={18} /> },
      { label: "Integrations", href: "/integrations", icon: <Puzzle size={18} /> },
    ],
  },
  {
    title: "Surveiller",
    items: [
      { label: "Historique d'appels", href: "/historique-appels", icon: <History size={18} /> },
      { label: "Campagnes", href: "/campagnes", icon: <Megaphone size={18} /> },
      { label: "Contacts", href: "/contacts", icon: <Users size={18} /> },
      { label: "Rendez-vous", href: "/rendez-vous", icon: <Calendar size={18} /> },
      { label: "Tickets", href: "/tickets", icon: <Ticket size={18} /> },
    ],
  },
  {
    title: "SMS",
    items: [
      { label: "Templates", href: "/sms/templates", icon: <MessageSquare size={18} /> },
      { label: "Historique SMS", href: "/sms/historique", icon: <History size={18} /> },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { signOut, profile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ padding: "1.25rem 1rem", borderBottom: "1px solid #1E293B" }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "0.5rem",
            background: "linear-gradient(135deg, #F97316, #EA580C)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Phone size={16} color="white" />
          </div>
          <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "white" }}>
            Hall<span style={{ color: "#F97316" }}>Call</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "0.5rem 1rem", overflowY: "auto" }}>
        {navigation.map((section) => (
          <div key={section.title}>
            <div className="sidebar-section-title">{section.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-item ${isActive(item.href) ? "active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div style={{ padding: "1rem", borderTop: "1px solid #1E293B" }}>
        <Link
          href="/abonnement"
          className={`sidebar-item ${isActive("/abonnement") ? "active" : ""}`}
          onClick={() => setMobileOpen(false)}
        >
          <CreditCard size={18} />
          <span>Abonnement</span>
        </Link>
        {profile && (
          <div style={{ padding: "0.5rem 1rem", fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>
            {profile.email}
          </div>
        )}
        <button
          onClick={() => signOut()}
          className="sidebar-item"
          style={{ color: "#ef4444", marginTop: "0.25rem" }}
        >
          <LogOut size={18} />
          <span>Deconnexion</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{
          position: "fixed",
          top: "1rem",
          left: "1rem",
          zIndex: 50,
          padding: "0.5rem",
          borderRadius: "0.5rem",
          background: "#0F172A",
          color: "white",
          border: "none",
          cursor: "pointer",
          display: "none",
        }}
        className="mobile-sidebar-toggle"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 39,
          }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        {sidebarContent}
      </aside>
    </>
  );
}
