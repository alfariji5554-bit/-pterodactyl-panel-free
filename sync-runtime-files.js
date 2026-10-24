
const fs = require("node:fs");
const path = require("node:path");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVER_ID = process.env.SERVER_ID;
const ROOT = path.resolve(process.env.RUNTIME_ROOT || process.cwd());

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".cache",
]);

const EXCLUDED_FILES = new Set([
  "sync-runtime-files.js",
  "runtime-log.js",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  return response;
}

function isExcluded(relative) {
  const parts = relative.split("/");
  const basename = path.posix.basename(relative);

  // Jangan pernah mengunggah .env atau file kredensial.
  if (parts.some((part) => part.startsWith(".env"))) return true;
  if (parts.some((part) => EXCLUDED_DIRS.has(part))) return true;
  if (EXCLUDED_FILES.has(basename)) return true;

  return false;
}

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(ROOT, fullPath).split(path.sep).join("/");

    if (isExcluded(relative) || entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      walk(fullPath, result);
    } else if (entry.isFile()) {
      result.push({ fullPath, relative });
    }
  }

  return result;
}

async function syncFile(file) {
  const stat = fs.statSync(file.fullPath);

  if (stat.size > MAX_FILE_SIZE) {
    console.warn(`Dilewati, ukuran melebihi 20 MB: ${file.relative}`);
    return false;
  }

  const storagePath = `${SERVER_ID}/${file.relative}`;
  const encodedPath = storagePath
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  await request(
    `${SUPABASE_URL}/storage/v1/object/server-files/${encodedPath}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
      },
      body: fs.readFileSync(file.fullPath),
    }
  );

  // Nama kolom sesuai skema server_files.
  const metadata = {
    server_id: SERVER_ID,
    path: `/${file.relative}`,
    name: path.posix.basename(file.relative),
    is_directory: false,
    size_bytes: stat.size,
    storage_path: storagePath,
    mime_type: "application/octet-stream",
    updated_at: new Date().toISOString(),
  };

  await request(
    `${SUPABASE_URL}/rest/v1/server_files?on_conflict=server_id%2Cpath`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(metadata),
    }
  );

  return true;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !SERVER_ID) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, dan SERVER_ID wajib diatur."
    );
  }

  const files = walk(ROOT);
  let total = 0;
  let uploaded = 0;

  for (const file of files) {
    const size = fs.statSync(file.fullPath).size;
    if (total + size > MAX_TOTAL_SIZE) {
      console.warn("Batas sinkronisasi 100 MB tercapai.");
      break;
    }

    if (await syncFile(file)) {
      total += size;
      uploaded++;
      console.log(`Tersimpan: ${file.relative}`);
    }
  }

  console.log(`Sinkronisasi selesai: ${uploaded} file.`);
}

main().catch((error) => {
  console.error("Sinkronisasi gagal:", error.message);
  process.exitCode = 1;
});
