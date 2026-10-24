"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import JSZip from "jszip";

type Server = {
  id: string;
  name: string;
  status: string;
  memory_mb: number;
  disk_mb: number;
  cpu_percent: number;
  startup_command: string | null;
};

type FileRow = {
  id?: number;
  path: string;
  name: string;
  is_directory: boolean;
  size_bytes: number;
  storage_path?: string;
};

type RuntimeLog = {
  id: number;
  log_level: string;
  message: string;
  created_at: string;
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
  const [startup, setStartup] = useState("node index.js");

  // Log aktivitas UI panel, misalnya upload dan tombol Start/Stop.
  const [logs, setLogs] = useState<string[]>([]);

  // Log proses runtime yang diambil dari API dan Supabase.
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLog[]>([]);
  const [runtimeLogError, setRuntimeLogError] = useState<string | null>(null);
  const [runtimeLogLoading, setRuntimeLogLoading] = useState(true);

  const [runUrl, setRunUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString("id-ID");
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 200));
  }

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/");
      return;
    }

    const { data: s, error } = await supabase
      .from("servers")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !s) {
      router.push("/dashboard/servers");
      return;
    }

    setServer(s);
    setStartup(s.startup_command || "node index.js");

    const { data: f } = await supabase
      .from("server_files")
      .select("id, path, name, is_directory, size_bytes, storage_path")
      .eq("server_id", id)
      .order("name");

    setFiles(f || []);
    setLoading(false);
  }

  // Muat informasi server dan polling status runtime.
  useEffect(() => {
    let active = true;

    async function loadServer() {
      await load();
    }

    void loadServer();

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/runtime/status?serverId=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );

        if (!response.ok || !active) return;

        const result = await response.json();

        if (result.status) {
          setServer((current) =>
            current ? { ...current, status: result.status } : current
          );
        }

        if (result.runUrl) {
          setRunUrl(result.runUrl);
        }
      } catch {
        // Status polling bersifat best-effort.
      }
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id]);

  // Ambil log runtime baru setiap 3 detik.
  useEffect(() => {
    let active = true;
    let lastId = 0;
    let polling = false;

    setRuntimeLogs([]);
    setRuntimeLogError(null);
    setRuntimeLogLoading(true);

    async function pollRuntimeLogs() {
      if (polling || !active) return;

      polling = true;

      try {
        const query = new URLSearchParams({
          serverId: id,
          after: String(lastId),
        });

        const response = await fetch(`/api/runtime/logs?${query.toString()}`, {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Gagal mengambil log runtime."
          );
        }

        if (!active) return;

        const incoming: RuntimeLog[] = Array.isArray(result.logs)
          ? result.logs
          : [];

        if (incoming.length > 0) {
          setRuntimeLogs((previous) => {
            const existingIds = new Set(previous.map((item) => item.id));
            const uniqueIncoming = incoming.filter(
              (item) => !existingIds.has(item.id)
            );

            return [...previous, ...uniqueIncoming].slice(-1000);
          });

          const numericIds = incoming
            .map((item) => Number(item.id))
            .filter((value) => Number.isSafeInteger(value) && value > 0);

          if (numericIds.length > 0) {
            lastId = Math.max(lastId, ...numericIds);
          }
        }

        const returnedLastId = Number(result.lastId);

        if (
          Number.isSafeInteger(returnedLastId) &&
          returnedLastId > lastId
        ) {
          lastId = returnedLastId;
        }

        setRuntimeLogError(null);
      } catch (error) {
        if (active) {
          setRuntimeLogError(
            error instanceof Error
              ? error.message
              : "Gagal mengambil log runtime."
          );
        }
      } finally {
        if (active) {
          setRuntimeLogLoading(false);
        }

        polling = false;
      }
    }

    void pollRuntimeLogs();

    const timer = window.setInterval(() => {
      void pollRuntimeLogs();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id]);

  async function setStatus(status: string) {
    if (!server) return;

    await supabase
      .from("servers")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", server.id);

    setServer({ ...server, status });
  }

  async function runtimeAction(action: "start" | "stop") {
    if (!server) return;

    try {
      addLog(
        action === "start"
          ? "Mengirim permintaan start ke GitHub Actions..."
          : "Mengirim permintaan stop..."
      );

      const response = await fetch(`/api/runtime/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: server.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Permintaan runtime gagal");
      }

      addLog(
        result.message ||
          (action === "start"
            ? "Runtime dijadwalkan."
            : "Runtime dihentikan.")
      );

      if (result.runUrl) {
        setRunUrl(result.runUrl);
        addLog(`GitHub Actions: ${result.runUrl}`);
      }

      await load();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Terjadi kesalahan";

      addLog("ERROR: " + message);
      alert(message);
    }
  }

  async function handleStart() {
    await runtimeAction("start");
  }

  async function handleStop() {
    await runtimeAction("stop");
  }

  async function handleRestart() {
    await handleStop();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await handleStart();
  }

  async function saveStartup() {
    if (!server) return;

    const { error } = await supabase
      .from("servers")
      .update({ startup_command: startup })
      .eq("id", server.id);

    if (error) {
      alert(error.message);
    } else {
      addLog("Startup saved: " + startup);
      setServer({ ...server, startup_command: startup });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file || !server) return;

    if (file.size > 20 * 1024 * 1024) {
      alert("Maksimal 20 MB");
      return;
    }

    setUploading(true);
    addLog(
      `Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`
    );

    try {
      const storagePath = `${server.id}/${file.name}`;

      const { error: upErr } = await supabase.storage
        .from("server-files")
        .upload(storagePath, file, { upsert: true });

      if (upErr) {
        addLog("Upload gagal: " + upErr.message);
        alert("Upload gagal: " + upErr.message);
        return;
      }

      const { error: metadataError } = await supabase
        .from("server_files")
        .upsert(
          {
            server_id: server.id,
            path: "/" + file.name,
            name: file.name,
            is_directory: false,
            size_bytes: file.size,
            storage_path: storagePath,
          },
          { onConflict: "server_id,path" }
        );

      if (metadataError) {
        addLog("Metadata upload gagal: " + metadataError.message);
        alert("File terunggah, tetapi metadata gagal: " + metadataError.message);
        return;
      }

      addLog(`Uploaded: ${file.name}`);
      await load();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDownload(file: FileRow) {
    if (!server) return;

    const storagePath = file.storage_path || `${server.id}/${file.name}`;

    const { data, error } = await supabase.storage
      .from("server-files")
      .download(storagePath);

    if (error || !data) {
      alert("Download gagal: " + (error?.message || "no data"));
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");

    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    addLog(`Downloaded: ${file.name}`);
  }

  async function handleExtract(file: FileRow) {
    if (!server) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      alert("Hanya file .zip yang bisa di-extract");
      return;
    }

    setMenuOpen(null);
    addLog(`Extracting ${file.name}...`);

    const storagePath = file.storage_path || `${server.id}/${file.name}`;

    const { data, error } = await supabase.storage
      .from("server-files")
      .download(storagePath);

    if (error || !data) {
      addLog("Extract gagal download: " + (error?.message || ""));
      return;
    }

    try {
      const zip = await JSZip.loadAsync(data);
      const entries = Object.keys(zip.files);

      let count = 0;
      let totalBytes = 0;

      const maxFiles = 500;
      const maxTotalBytes = 100 * 1024 * 1024;

      if (entries.length > maxFiles) {
        throw new Error("ZIP terlalu banyak entry (maksimal 500).");
      }

      for (const entryName of entries) {
        const entry = zip.files[entryName];

        if (entry.dir) continue;

        const relativePath = entryName
          .replace(/\\/g, "/")
          .replace(/^\/+/, "");

        const parts = relativePath.split("/");

        if (
          !relativePath ||
          relativePath.includes("\0") ||
          /^[A-Za-z]:/.test(relativePath) ||
          parts.some(
            (part) => !part || part === "." || part === ".."
          )
        ) {
          throw new Error(`Path ZIP tidak aman: ${entryName}`);
        }

        const content = await entry.async("blob");

        totalBytes += content.size;

        if (
          content.size > 20 * 1024 * 1024 ||
          totalBytes > maxTotalBytes
        ) {
          throw new Error(
            "ZIP melewati batas 20 MB per file atau 100 MB total."
          );
        }

        const extractedStoragePath = `${server.id}/${relativePath}`;
        const displayName = parts[parts.length - 1];

        const { error: uploadError } = await supabase.storage
          .from("server-files")
          .upload(extractedStoragePath, content, { upsert: true });

        if (uploadError) {
          throw new Error(
            `Upload ${relativePath} gagal: ${uploadError.message}`
          );
        }

        const { error: metadataError } = await supabase
          .from("server_files")
          .upsert(
            {
              server_id: server.id,
              path: "/" + relativePath,
              name: displayName,
              is_directory: false,
              size_bytes: content.size,
              storage_path: extractedStoragePath,
            },
            { onConflict: "server_id,path" }
          );

        if (metadataError) {
          throw new Error(
            `Metadata ${relativePath} gagal: ${metadataError.message}`
          );
        }

        count++;
      }

      addLog(
        `Extract selesai: ${count} file; struktur folder dipertahankan.`
      );

      await load();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Terjadi kesalahan";

      addLog("Extract error: " + message);
      alert("Extract error: " + message);
    }
  }

  async function handleDeleteFile(file: FileRow) {
    if (!server || !confirm(`Hapus ${file.name}?`)) return;

    setMenuOpen(null);

    const storagePath = file.storage_path || `${server.id}/${file.name}`;

    const { error: storageError } = await supabase.storage
      .from("server-files")
      .remove([storagePath]);

    if (storageError) {
      alert("Gagal menghapus file: " + storageError.message);
      return;
    }

    let deleteQuery = supabase.from("server_files").delete();

    if (file.id) {
      deleteQuery = deleteQuery.eq("id", file.id);
    } else {
      deleteQuery = deleteQuery
        .eq("server_id", server.id)
        .eq("name", file.name);
    }

    const { error: metadataError } = await deleteQuery;

    if (metadataError) {
      alert("File dihapus dari storage, tetapi metadata gagal dihapus: " + metadataError.message);
      return;
    }

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

  const isOnline =
    server.status === "online" ||
    server.status === "starting" ||
    server.status === "queued";

  function logColor(level: string) {
    switch (level.toLowerCase()) {
      case "error":
      case "fatal":
        return "text-red-400";
      case "warning":
      case "warn":
        return "text-yellow-300";
      case "debug":
        return "text-panel-muted";
      default:
        return "text-green-400/90";
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-panel-bg text-white">
      <header className="bg-panel-card border-b border-panel-border px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/servers"
            className="text-panel-muted hover:text-white text-sm shrink-0"
          >
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

      <main className="flex-1 p-4 overflow-auto">
        {tab === "console" && (
          <div className="space-y-4">
            <div className="bg-black rounded-xl border border-panel-border h-[65vh] overflow-y-auto p-4 font-mono text-xs sm:text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-panel-border pb-3">
                <span className="text-white font-semibold">
                  Console runtime
                </span>

                <span className="text-panel-muted">
                  {runtimeLogLoading
                    ? "Menghubungkan..."
                    : runtimeLogError
                    ? "Koneksi log bermasalah"
                    : "Polling setiap 3 detik"}
                </span>
              </div>

              {runtimeLogError && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300 break-words">
                  Gagal mengambil log: {runtimeLogError}
                  <div className="mt-1 text-xs text-red-200/80">
                    Pastikan endpoint /api/runtime/logs dan tabel
                    Supabase runtime_logs sudah tersedia.
                  </div>
                </div>
              )}

              {runtimeLogs.length === 0 && !runtimeLogLoading && !runtimeLogError && (
                <div className="text-panel-muted py-3">
                  Belum ada log runtime tersimpan. Tekan Start dan pastikan
                  workflow GitHub Actions berjalan serta mengirim log ke
                  Supabase.
                </div>
              )}

              {runtimeLogs.length === 0 && runtimeLogLoading && (
                <div className="text-panel-muted py-3">
                  Mengambil log runtime dari Supabase...
                </div>
              )}

              <div className="space-y-1">
                {runtimeLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`${logColor(log.log_level)} leading-relaxed break-words whitespace-pre-wrap`}
                  >
                    <span className="text-panel-muted select-none">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleTimeString("id-ID")
                        : "--:--:--"}
                    </span>{" "}
                    <span className="text-panel-muted">
                      [{log.log_level.toUpperCase()}]
                    </span>{" "}
                    {log.message}
                  </div>
                ))}
              </div>

              {runUrl && (
                <div className="mt-4 border-t border-panel-border pt-3">
                  <a
                    className="text-blue-400 hover:underline"
                    href={runUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka workflow di GitHub Actions ↗
                  </a>
                </div>
              )}
            </div>

            <details className="bg-panel-card border border-panel-border rounded-xl">
              <summary className="cursor-pointer px-4 py-3 text-sm text-panel-muted hover:text-white">
                Aktivitas panel ({logs.length})
              </summary>

              <div className="border-t border-panel-border p-4 font-mono text-xs sm:text-sm space-y-1 max-h-60 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-panel-muted">
                    Belum ada aktivitas panel.
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div
                      key={`${index}-${log}`}
                      className="text-panel-muted break-words whitespace-pre-wrap"
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </details>
          </div>
        )}

        {tab === "files" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="bg-panel-accent hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg cursor-pointer">
                {uploading ? "Uploading..." : "Upload File"}

                <input
                  type="file"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                  accept=".zip,.js,.ts,.json,.py,.txt,.md,.jar,.yml,.yaml"
                />
              </label>

              <span className="text-xs text-panel-muted">
                Max 20 MB · zip bisa di-Extract
              </span>
            </div>

            {files.length === 0 ? (
              <div className="bg-panel-card border border-panel-border rounded-xl p-8 text-center text-panel-muted">
                Belum ada file. Upload zip / package.json / index.js dulu.
              </div>
            ) : (
              <div className="bg-panel-card border border-panel-border rounded-xl divide-y divide-panel-border">
                {files.map((f) => (
                  <div
                    key={f.path + (f.id || "")}
                    className="flex items-center justify-between px-4 py-3 gap-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm">
                        {f.name.endsWith(".zip") ? "📦" : "📄"}
                      </span>

                      <span className="text-sm truncate">{f.name}</span>

                      <span className="text-xs text-panel-muted shrink-0">
                        {(f.size_bytes / 1024).toFixed(1)} KB
                      </span>
                    </div>

                    <div className="relative shrink-0">
                      <button
                        onClick={() =>
                          setMenuOpen(menuOpen === f.name ? null : f.name)
                        }
                        className="text-panel-muted hover:text-white px-2 py-1 text-lg leading-none"
                      >
                        ⋯
                      </button>

                      {menuOpen === f.name && (
                        <div className="absolute right-0 top-8 z-20 bg-panel-card border border-panel-border rounded-lg shadow-xl py-1 min-w-[140px]">
                          <button
                            onClick={() => {
                              setMenuOpen(null);
                              void handleDownload(f);
                            }}
                            className="block w-full text-left px-3 py-2 text-sm hover:bg-panel-border/50"
                          >
                            Download
                          </button>

                          {f.name.toLowerCase().endsWith(".zip") && (
                            <button
                              onClick={() => void handleExtract(f)}
                              className="block w-full text-left px-3 py-2 text-sm hover:bg-panel-border/50"
                            >
                              Extract / Unarchive
                            </button>
                          )}

                          <button
                            onClick={() => void handleDeleteFile(f)}
                            className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-panel-border/50"
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "startup" && (
          <div className="max-w-xl space-y-4">
            <div>
              <label className="block text-sm text-panel-muted mb-1">
                Startup Command
              </label>

              <input
                value={startup}
                onChange={(e) => setStartup(e.target.value)}
                className="w-full bg-panel-bg border border-panel-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-panel-accent"
                placeholder="node index.js"
              />

              <p className="text-xs text-panel-muted mt-2">
                Contoh: node index.js · npm start · python main.py
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

