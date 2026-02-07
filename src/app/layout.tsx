import type { Metadata } from "next";
import { DM_Sans, Roboto } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "HallCall - Plateforme d'agents vocaux IA",
  description: "Creez, gerez et deployez vos agents conversationnels IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${dmSans.variable} ${roboto.variable} min-h-screen`}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
