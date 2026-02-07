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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{
          width: "2.5rem",
          height: "2.5rem",
          border: "4px solid #FFEDD5",
          borderTopColor: "#F97316",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: "260px", display: "flex", flexDirection: "column" }}>
        <TopBar />
        <main style={{ flex: 1, padding: "1.5rem", backgroundColor: "#f9fafb" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
