
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVER_ID = process.env.SERVER_ID;
const ROOT = path.resolve(
  process.env.RUNTIME_ROOT || process.cwd()
);

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
]);

const IGNORED_FILES = new Set([
  ".runtime-placeholder",
  "runtime-log.js",
  "sync-runtime-files.js",
]);

const uploadedHashes = new Map();
let syncing = false;

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_BATCH_SIZE = 100 * 1024 * 1024;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(url, options = {}) {
  if (!BASE_URL || !SERVICE_KEY || !SERVER_ID) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, atau SERVER_ID belum diatur."
    );
  }

  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;

    try {
      response = await fetch(url, {
        ...options,
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          ...options.headers,
        },
        signal: AbortSignal.timeout(60000),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1500);
      continue;
    }

    if (response.ok) return response;

    const message =
      `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;

    if (response.status < 500 && response.status !== 429) {
      throw new Error(message);
    }

    lastError = new Error(message);

    if (attempt < 3) await sleep(attempt * 1500);
  }

  throw lastError || new Error("Permintaan Supabase gagal.");
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(ROOT, fullPath)
      .split(path.sep)
      .join("/");

    const parts = relative.split("/");

    // Jangan unggah secret atau direktori dependensi.
    if (
      parts.some(part =>
        IGNORED_DIRS.has(part) || part.startsWith(".env")
      ) ||
      IGNORED_FILES.has(path.basename(relative)) ||
      entry.isSymbolicLink()
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(fullPath, output);
    } else if (entry.isFile()) {
      output.push({
        fullPath,
        relative,
      });
    }
  }

  return output;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();

  const types = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".cjs": "text/javascript",
    ".json": "application/json",
    ".html": "text/html",
    ".css": "text/css",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".xml": "application/xml",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".db": "application/octet-stream",
    ".sqlite": "application/octet-stream",
    ".sqlite3": "application/octet-stream",
  };

  return types[ext] || "application/octet-stream";
}

async function sync() {
  if (syncing) {
    console.log("Sinkronisasi sebelumnya masih berjalan.");
    return;
  }

  syncing = true;

  try {
    const files = walk(ROOT);
    let uploaded = 0;
    let unchanged = 0;
    let totalBytes = 0;

    for (const file of files) {
      let content;

      try {
        content = fs.readFileSync(file.fullPath);
      } catch (error) {
        console.warn(
          `File gagal dibaca: ${file.relative}: ${error.message}`
        );
        continue;
      }

      if (content.length > MAX_FILE_SIZE) {
        console.warn(
          `File melebihi batas 50 MB, dilewati: ${file.relative}`
        );
        continue;
      }

      const hash = crypto
        .createHash("sha256")
        .update(content)
        .digest("hex");

      if (uploadedHashes.get(file.relative) === hash) {
        unchanged++;
        continue;
      }

      if (totalBytes + content.length > MAX_BATCH_SIZE) {
        console.warn(
          "Batas 100 MB per putaran tercapai. File tersisa akan dicoba pada putaran berikutnya."
        );
        break;
      }

      const storagePath = `${SERVER_ID}/${file.relative}`;
      const encodedPath = storagePath
        .split("/")
        .map(encodeURIComponent)
        .join("/");

      // Simpan isi file ke bucket Supabase Storage.
      await request(
        `${BASE_URL}/storage/v1/object/server-files/${encodedPath}`,
        {
          method: "POST",
          headers: {
            "Content-Type": getMimeType(file.relative),
            "x-upsert": "true",
          },
          body: content,
        }
      );

      // Metadata menggunakan format path dashboard: /folder/file.ext
      const row = {
        server_id: SERVER_ID,
        path: "/" + file.relative.replace(/^\/+/, ""),
        name: path.basename(file.relative),
        is_directory: false,
        size_bytes: content.length,
        mime_type: getMimeType(file.relative),
        storage_path: storagePath,
        updated_at: new Date().toISOString(),
      };

      const params = new URLSearchParams({
        on_conflict: "server_id,path",
      });

      await request(
        `${BASE_URL}/rest/v1/server_files?${params}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        }
      );

      uploadedHashes.set(file.relative, hash);
      totalBytes += content.length;
      uploaded++;

      console.log(`Tersimpan: ${file.relative}`);
    }

    console.log(
      `Sinkronisasi selesai. Diunggah: ${uploaded}; tidak berubah: ${unchanged}.`
    );
  } catch (error) {
    console.error(`Sinkronisasi gagal: ${error.message}`);
    throw error;
  } finally {
    syncing = false;
  }
}

if (require.main === module) {
  sync().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = { sync };
