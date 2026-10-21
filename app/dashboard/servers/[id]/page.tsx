"use client";

import { useEffect, useState, use } from "react";
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
  startup_command: string | null;
  image: string | null;
};

type FileRow = {
  id: number;
  path: string;
  name: string;
  is_directory: boolean;
  size_bytes: number;
};

export default function ServerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [server, setServer] = useState<Server | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [tab, setTab] = useState<"console" | "files" | "startup">("console");
  const [startup, setStartup] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/");
      return;
    }

    const { data: s } = await supabase
      .from("servers")
      .select("*")
      .eq("id", id)
      .single();

    if (!s) {
      router.push("/dashboard/servers");
      return;
    }

    setServer(s);
    setStartup(s.startup_command || "node index.js");

    const { data: f } = await supabase
      .from("server_files")
      .select("id, path, name, is_directory, size_bytes")
      .eq("server_id", id)
      .order("name");

    setFiles(f || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString("id-ID");
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 100));
  }

  async function setStatus(status: string) {
    if (!server) return;
    const { error } = await supabase
      .from("servers")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", server.id);

    if (error) {
      addLog("ERROR: " + error.message);
      return;
    }

    setServer({ ...server, status });
    addLog(`Status → ${status.toUpperCase()}`);

    await supabase.from("activity_logs").insert({
      server_id: server.id,
      action: status,
      details: { source: "panel" },
    });
  }

  async function handleStart() {
    addLog("Starting server...");
    await setStatus("starting");
    setTimeout(async () => {
      await setStatus("online");
      addLog("Server is now ONLINE");
      addLog(`Running: ${startup || "node index.js"}`);
    }, 1500);
  }

  async function handleStop() {
    addLog("Stopping server...");
    await setStatus("stopping");
    setTimeout(async () => {
      await setStatus("offline");
      addLog("Server is now OFFLINE");
    }, 1000);
  }

  async function handleRestart() {
    addLog("Restarting...");
    await setStatus("stopping");
    setTimeout(async () => {
      await setStatus("starting");
      setTimeout(async () => {
        await setStatus("online");
        addLog("Server restarted and ONLINE");
      }, 1200);
    }, 800);
  }

  async function saveStartup() {
    if (!server) return;
    const { error } = await supabase
      .from("servers")
      .update({ startup_command: startup })
      .eq("id", server.id);

    if (error) alert(error.message);
    else {
      addLog("Startup command updated: " + startup);
      setServer({ ...server, startup_command: startup });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !server) return;

    setUploading(true);
    addLog(`Uploading ${file.name}...`);

    const path = `\( {server.id}/ \){file.name}`;

    const { error: upErr } = await supabase.storage
      .from("server-files")
      .upload(path, file, { upsert: true });

    if (upErr) {
      addLog("Upload gagal: " + upErr.message);
      setUploading(false);
      return;
    }

    await supabase.from("server_files").upsert(
      {
        server_id: server.id,
        path: "/" + file.name,
        name: file.name,
        is_directory: false,
        size_bytes: file.size,
        storage_path: path,
      },
      { onConflict: "server_id,path" }
    );

    addLog(`Uploaded: ${file.name}`);
    await load();
    setUploading(false);
  }

  async function handleDeleteFile(file: FileRow) {
    if (!server) return;
    if (!confirm(`Hapus ${file.name}?`)) return;

    const storagePath = `\( {server.id}/ \){file.name}`;
    await supabase.storage.from("server-files").remove([storagePath]);
    await supabase.from("server_files").delete().eq("id", file.id);
    addLog(`Deleted: ${file.name}`);
    await load();
  }

  if (loading || !server) {
    return (
      <div className="min-h-screen flex items-center justify-center text-panel-muted">
        Memuat server...
      </div>
    );
  }

  const isOnline = server.status === "online" || server.status === "starting";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-panel-card border-b border-panel-border px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/servers" className="text-panel-muted hover:text-white text-sm">
            ← Servers
          </Link>
          <span className="font-medium truncate">{server.name}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
              server.status === "online"
                ? "bg-green-500/20 text-green-400"
                : server.status === "starting"
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-panel-border text-panel-muted"
            }`}
          >
            {server.status}
          </span>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleStart}
            disabled={isOnline}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
          >
            Start
          </button>
          <button
            onClick={handleRestart}
            className="bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
          >
            Restart
          </button>
          <button
            onClick={handleStop}
            disabled={server.status === "offline"}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
          >
            Stop
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-panel-card border-b border-panel-border px-4 flex gap-1">
        {(["console", "files", "startup"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm capitalize ${
              tab === t
                ? "text-panel-accent border-b-2 border-panel-accent"
                : "text-panel-muted hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 p-4 overflow-auto">
        {tab === "console" && (
          <div className="bg-black rounded-xl border border-panel-border h-[60vh] overflow-y-auto p-4 font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-panel-muted">Console siap. Tekan Start untuk menjalankan server.</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="text-green-400/90 leading-relaxed">
                  {l}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="bg-panel-accent hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg cursor-pointer">
                {uploading ? "Uploading..." : "Upload File"}
                <input
                  type="file"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
              <span className="text-xs text-panel-muted">
                Bisa upload .zip, .js, .py, dll. Extract zip nanti (butuh worker).
              </span>
            </div>

            {files.length === 0 ? (
              <div className="bg-panel-card border border-panel-border rounded-xl p-8 text-center text-panel-muted">
                Belum ada file. Upload dulu.
              </div>
            ) : (
              <div className="bg-panel-card border border-panel-border rounded-xl divide-y divide-panel-border">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-panel-muted text-sm">{f.is_directory ? "📁" : "📄"}</span>
                      <span className="text-sm truncate">{f.name}</span>
                      <span className="text-xs text-panel-muted shrink-0">
                        {(f.size_bytes / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(f)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "startup" && (
          <div className="max-w-xl space-y-4">
            <div>
              <label className="block text-sm text-panel-muted mb-1">Startup Command</label>
              <input
                value={startup}
                onChange={(e) => setStartup(e.target.value)}
                className="w-full bg-panel-bg border border-panel-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-panel-accent"
                placeholder="node index.js"
              />
              <p className="text-xs text-panel-muted mt-2">
                Contoh: <code>node index.js</code> · <code>npm start</code> ·{" "}
                <code>python main.py</code> ·{" "}
                <code>java -Xmx1024M -jar server.jar</code>
              </p>
            </div>
            <button
              onClick={saveStartup}
              className="bg-panel-accent hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg"
            >
              Simpan Startup
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
