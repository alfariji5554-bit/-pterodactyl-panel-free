"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }
      setEmail(user.email ?? null);
      setLoading(false);
    }
    load();
  }, [router, supabase.auth]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-panel-muted">
        Memuat...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar sederhana */}
      <aside className="w-64 bg-panel-card border-r border-panel-border p-4 flex flex-col">
        <div className="text-lg font-semibold mb-8">Pterodactyl Free</div>
        <nav className="space-y-1 flex-1">
          <a href="/dashboard" className="block px-3 py-2 rounded-lg bg-panel-accent/20 text-panel-accent text-sm">
            Dashboard
          </a>
          <a href="/dashboard/servers" className="block px-3 py-2 rounded-lg text-panel-muted hover:bg-panel-border/50 text-sm">
            Servers
          </a>
          <a href="/dashboard/account" className="block px-3 py-2 rounded-lg text-panel-muted hover:bg-panel-border/50 text-sm">
            Account
          </a>
        </nav>
        <button
          onClick={handleLogout}
          className="mt-4 text-sm text-red-400 hover:text-red-300 text-left px-3"
        >
          Logout
        </button>
      </aside>

      {/* Konten */}
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold mb-2">Dashboard</h1>
        <p className="text-panel-muted text-sm mb-8">
          Selamat datang, {email}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-panel-card border border-panel-border rounded-xl p-5">
            <div className="text-panel-muted text-sm">Total Server</div>
            <div className="text-3xl font-bold mt-1">0</div>
          </div>
          <div className="bg-panel-card border border-panel-border rounded-xl p-5">
            <div className="text-panel-muted text-sm">Online</div>
            <div className="text-3xl font-bold mt-1 text-green-400">0</div>
          </div>
          <div className="bg-panel-card border border-panel-border rounded-xl p-5">
            <div className="text-panel-muted text-sm">Offline</div>
            <div className="text-3xl font-bold mt-1 text-panel-muted">0</div>
          </div>
        </div>

        <div className="mt-8 bg-panel-card border border-panel-border rounded-xl p-6">
          <h2 className="font-medium mb-2">Langkah selanjutnya</h2>
          <p className="text-sm text-panel-muted">
            Nanti di sini muncul daftar server, tombol create server, file manager, console, dll.
            Sekarang auth + layout dasar sudah jalan.
          </p>
        </div>
      </main>
    </div>
  );
}
