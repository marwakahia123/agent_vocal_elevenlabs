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
      <div className="px-4 py-5 border-b border-slate-200">
        <Link href="/" className="no-underline flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <Phone size={16} color="white" />
          </div>
          <span className="text-xl font-bold text-slate-900">
            Hall<span className="text-slate-900">Call</span>
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 overflow-y-auto">
        {navigation.map((section) => (
          <div key={section.title}>
            <div className="sidebar-section-title">{section.title}</div>
            <div className="flex flex-col gap-0.5">
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
      <div className="p-4 border-t border-slate-200">
        <Link
          href="/abonnement"
          className={`sidebar-item ${isActive("/abonnement") ? "active" : ""}`}
          onClick={() => setMobileOpen(false)}
        >
          <CreditCard size={18} />
          <span>Abonnement</span>
        </Link>
        {profile && (
          <div className="px-4 py-2 text-xs text-slate-400 mt-1">
            {profile.email}
          </div>
        )}
        <button
          onClick={() => signOut()}
          className="sidebar-item text-red-500 mt-1"
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
        className="mobile-sidebar-toggle fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-900 text-white border-none cursor-pointer"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/50 z-[39]"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        {sidebarContent}
      </aside>
    </>
  );
}
