import { getRuntimeContext, githubRequest } from "@/lib/runtime/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await getRuntimeContext();
  if (context.response) return context.response;

  let body: { serverId?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Body JSON tidak valid." }, { status: 400 }); }
  const serverId = body.serverId?.trim();
  if (!serverId || !/^[0-9a-f-]{16,64}$/i.test(serverId)) return Response.json({ error: "serverId tidak valid." }, { status: 400 });

  const { data: server, error } = await context.supabase
    .from("servers").select("id").eq("id", serverId).eq("owner_id", context.user!.id).single();
  if (error || !server) return Response.json({ error: "Server tidak ditemukan atau bukan milik akun ini." }, { status: 404 });

  try {
    const result = await githubRequest("/actions/runs?per_page=100");
    const runs = (result as { workflow_runs?: Array<{ id: number; display_title: string; status: string; html_url: string; path: string }> }).workflow_runs || [];
    const run = runs.find((item) =>
      item.path.endsWith("/runtime.yml") &&
      item.display_title === `runtime-${serverId}` &&
      ["queued", "in_progress", "waiting", "pending"].includes(item.status)
    );
    if (run) {
      await githubRequest(`/actions/runs/${run.id}/cancel`, { method: "POST" });
    }
    await context.supabase.from("servers").update({ status: "offline", updated_at: new Date().toISOString() }).eq("id", server.id).eq("owner_id", context.user!.id);
    return Response.json({ ok: true, status: "offline", message: run ? "Permintaan pembatalan dikirim." : "Tidak ada runtime aktif yang ditemukan." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menghentikan runtime.";
    return Response.json({ error: message }, { status: 502 });
  }
}
