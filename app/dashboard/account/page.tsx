"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AccountPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, role")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUsername(profile.username);
        setRole(profile.role);
      }
      setLoading(false);
    }
    load();
  }, []);

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
      <aside className="w-64 bg-panel-card border-r border-panel-border p-4 flex flex-col">
        <div className="text-lg font-semibold mb-8">Pterodactyl Free</div>
        <nav className="space-y-1 flex-1">
          <Link href="/dashboard" className="block px-3 py-2 rounded-lg text-panel-muted hover:bg-panel-border/50 text-sm">
            Dashboard
          </Link>
          <Link href="/dashboard/servers" className="block px-3 py-2 rounded-lg text-panel-muted hover:bg-panel-border/50 text-sm">
            Servers
          </Link>
          <Link href="/dashboard/account" className="block px-3 py-2 rounded-lg bg-panel-accent/20 text-panel-accent text-sm">
            Account
          </Link>
        </nav>
        <button onClick={handleLogout} className="mt-4 text-sm text-red-400 hover:text-red-300 text-left px-3">
          Logout
        </button>
      </aside>

      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold mb-6">Account</h1>

        <div className="bg-panel-card border border-panel-border rounded-xl p-6 max-w-md space-y-4">
          <div>
            <div className="text-sm text-panel-muted">Email</div>
            <div className="font-medium mt-0.5">{email}</div>
          </div>
          <div>
            <div className="text-sm text-panel-muted">Username</div>
            <div className="font-medium mt-0.5">{username || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-panel-muted">Role</div>
            <div className="font-medium mt-0.5 capitalize">{role || "user"}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
