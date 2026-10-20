import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pterodactyl Panel Free",
  description: "Panel manajemen server gratis – Netlify + Supabase",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-panel-bg text-panel-text antialiased">
        {children}
      </body>
    </html>
  );
}
