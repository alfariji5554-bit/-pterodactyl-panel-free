"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Server = {
  id: string;
  name: string;
  status: string;
  memory_mb: number;
  disk_mb: number;
  cpu_percent: number;
  created_at: string;
};

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [memory, setMemory] = useState(1024);
  const [disk, setDisk] = useState(5120);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function loadServers() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/");
      return;
    }

    const { data, error } = await supabase
      .from("servers")
      .select("id, name, status, memory_mb, disk_mb, cpu_percent, created_at")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setServers(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadServers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCreating(false);
      return;
    }

    const { error } = await supabase.from("servers").insert({
      name: name.trim(),
      owner_id: user.id,
      memory_mb: memory,
      disk_mb: disk,
      cpu_percent: 100,
      status: "offline",
      startup_command: "node index.js",
    });

    if (error) {
      alert("Gagal buat server: " + error.message);
    } else {
      setShowCreate(false);
      setName("");
      setMemory(1024);
      setDisk(5120);
      await loadServers();
    }

    setCreating(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-panel-muted">
        Memuat servers...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-panel-card border-r border-panel-border p-4 flex flex-col shrink-0">
        <div className="text-lg font-semibold mb-8">Pterodactyl Free</div>
        <nav className="space-y-1 flex-1">
          <Link
            href="/dashboard"
            className="block px-3 py-2 rounded-lg text-panel-muted hover:bg-panel-border/50 text-sm"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/servers"
            className="block px-3 py-2 rounded-lg bg-panel-accent/20 text-panel-accent text-sm"
          >
            Servers
          </Link>
          <Link
            href="/dashboard/account"
            className="block px-3 py-2 rounded-lg text-panel-muted hover:bg-panel-border/50 text-sm"
          >
            Account
          </Link>
        </nav>
        <button
          onClick={handleLogout}
          className="mt-4 text-sm text-red-400 hover:text-red-300 text-left px-3"
        >
          Logout
        </button>
      </aside>

      {/* Konten */}
      <main className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="flex items-center justify-between mb-6 gap-4">
          <h1 className="text-2xl font-semibold">Servers</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-panel-accent hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shrink-0"
          >
            + Create Server
          </button>
        </div>

        {servers.length === 0 ? (
          <div className="bg-panel-card border border-panel-border rounded-xl p-10 text-center text-panel-muted">
            Belum ada server. Klik <strong>+ Create Server</strong> untuk membuat.
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/servers/${s.id}`}
                className="bg-panel-card border border-panel-border rounded-xl p-4 flex items-center justify-between hover:border-panel-accent transition block"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-panel-muted mt-1">
                    {s.memory_mb} MB RAM · {s.disk_mb} MB Disk · CPU {s.cpu_percent}%
                  </div>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full shrink-0 ml-3 ${
                    s.status === "online"
                      ? "bg-green-500/20 text-green-400"
                      : s.status === "starting"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-panel-border text-panel-muted"
                  }`}
                >
                  {s.status}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Modal Create */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-panel-card border border-panel-border rounded-xl p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold mb-4">Create Server</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-panel-muted mb-1">
                    Nama Server
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-panel-bg border border-panel-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-panel-accent"
                    placeholder="My Bot / Minecraft Server"
                  />
                </div>

                <div>
                  <label className="block text-sm text-panel-muted mb-1">
                    Memory (MB)
                  </label>
                  <input
                    type="number"
                    min={256}
                    value={memory}
                    onChange={(e) => setMemory(Number(e.target.value))}
                    className="w-full bg-panel-bg border border-panel-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-panel-accent"
                  />
                </div>

                <div>
                  <label className="block text-sm text-panel-muted mb-1">
                    Disk (MB)
                  </label>
                  <input
                    type="number"
                    min={1024}
                    value={disk}
                    onChange={(e) => setDisk(Number(e.target.value))}
                    className="w-full bg-panel-bg border border-panel-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-panel-accent"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 border border-panel-border rounded-lg py-2.5 text-sm"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 bg-panel-accent hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm"
                  >
                    {creating ? "Membuat..." : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
