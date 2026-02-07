"use client";

import Link from "next/link";
import { Mic2 } from "lucide-react";

export default function Header() {
  return (
    <header style={{ backgroundColor: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "4rem" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
            <Mic2 style={{ height: "2rem", width: "2rem", color: "#4f46e5" }} />
            <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827" }}>
              Agent Vocal Labs
            </span>
          </Link>
          <nav>
            <Link href="/" style={{ fontSize: "0.875rem", color: "#6b7280", textDecoration: "none" }}>
              Mes Agents
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
