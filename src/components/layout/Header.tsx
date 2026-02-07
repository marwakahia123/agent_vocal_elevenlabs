"use client";

import Link from "next/link";
import { Mic2 } from "lucide-react";

export default function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <Mic2 className="h-8 w-8 text-slate-900" />
            <span className="text-xl font-bold text-slate-900">
              Agent Vocal Labs
            </span>
          </Link>
          <nav>
            <Link href="/" className="text-sm text-slate-500 no-underline hover:text-slate-900 transition-colors">
              Mes Agents
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
