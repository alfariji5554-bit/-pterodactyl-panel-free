import { createClient } from "@/lib/supabase/server";

export async function getRuntimeContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase, user: null, response: Response.json({ error: "Silakan login terlebih dahulu." }, { status: 401 }) };
  }

  const adminEmail = process.env.PANEL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    return { supabase, user: null, response: Response.json({ error: "PANEL_ADMIN_EMAIL belum diatur di environment Netlify." }, { status: 503 }) };
  }
  if ((user.email || "").toLowerCase() !== adminEmail) {
    return { supabase, user: null, response: Response.json({ error: "Akun ini tidak diizinkan mengelola runtime." }, { status: 403 }) };
  }
  return { supabase, user, response: null };
}

export function getGitHubConfig() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const workflow = process.env.GITHUB_WORKFLOW_FILE || "runtime.yml";
  const ref = process.env.GITHUB_REF || "main";
  if (!owner || !repo || !token) return null;
  return { owner, repo, token, workflow, ref };
}

export async function githubRequest(path: string, init: RequestInit = {}) {
  const config = getGitHubConfig();
  if (!config) throw new Error("Konfigurasi GITHUB_OWNER, GITHUB_REPO, dan GITHUB_TOKEN belum lengkap.");
  const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API (${response.status}): ${body.slice(0, 500)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}
