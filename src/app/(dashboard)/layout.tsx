"use client";

import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { useAuth } from "@/contexts/AuthContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-[260px] flex flex-col">
        <TopBar />
        <main className="flex-1 p-6 bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
