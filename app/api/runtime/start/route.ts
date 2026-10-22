import { getRuntimeContext, getGitHubConfig, githubRequest } from "@/lib/runtime/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await getRuntimeContext();
  if (context.response) return context.response;

  const config = getGitHubConfig();
  if (!config) return Response.json({ error: "Konfigurasi GitHub runtime belum lengkap di Netlify." }, { status: 503 });

  let body: { serverId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Body JSON tidak valid." }, { status: 400 }); }
  const serverId = body.serverId?.trim();
  if (!serverId || !/^[0-9a-f-]{16,64}$/i.test(serverId)) {
    return Response.json({ error: "serverId tidak valid." }, { status: 400 });
  }

  const { data: server, error } = await context.supabase
    .from("servers")
    .select("id, name, owner_id, startup_command")
    .eq("id", serverId)
    .eq("owner_id", context.user!.id)
    .single();
  if (error || !server) return Response.json({ error: "Server tidak ditemukan atau bukan milik akun ini." }, { status: 404 });

  try {
    await githubRequest(`/actions/workflows/${encodeURIComponent(config.workflow)}/dispatches`, {
      method: "POST",
      body: JSON.stringify({
        ref: config.ref,
        inputs: { server_id: server.id, server_name: server.name.slice(0, 100), startup_command: String(server.startup_command || "node index.js").slice(0, 500) },
      }),
    });
    await context.supabase.from("servers").update({ status: "starting", updated_at: new Date().toISOString() }).eq("id", server.id).eq("owner_id", context.user!.id);
    return Response.json({ ok: true, status: "starting", message: "Runtime dikirim ke GitHub Actions. Ini runtime sementara, bukan proses 24/7." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memulai runtime.";
    return Response.json({ error: message }, { status: 502 });
  }
}
