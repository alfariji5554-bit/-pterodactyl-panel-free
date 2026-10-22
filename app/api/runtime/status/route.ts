import { getRuntimeContext, githubRequest } from "@/lib/runtime/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getRuntimeContext();
  if (context.response) return context.response;

  const url = new URL(request.url);
  const serverId = url.searchParams.get("serverId")?.trim();
  if (!serverId || !/^[0-9a-f-]{16,64}$/i.test(serverId)) return Response.json({ error: "serverId tidak valid." }, { status: 400 });

  const { data: server, error } = await context.supabase
    .from("servers").select("id, status").eq("id", serverId).eq("owner_id", context.user!.id).single();
  if (error || !server) return Response.json({ error: "Server tidak ditemukan." }, { status: 404 });

  try {
    const result = await githubRequest("/actions/runs?per_page=100");
    const runs = (result as { workflow_runs?: Array<{ id: number; display_title: string; status: string; conclusion: string | null; html_url: string; path: string; created_at: string }> }).workflow_runs || [];
    const run = runs.find((item) => item.path.endsWith("/runtime.yml") && item.display_title === `runtime-${serverId}`);
    if (!run) return Response.json({ status: server.status });
    const status = run.status === "completed" ? "offline" : run.status === "in_progress" ? "online" : "starting";
    if (status !== server.status) {
      await context.supabase.from("servers").update({ status, updated_at: new Date().toISOString() }).eq("id", server.id).eq("owner_id", context.user!.id);
    }
    return Response.json({ status, runUrl: run.html_url, conclusion: run.conclusion, updatedAt: run.created_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membaca status runtime.";
    return Response.json({ status: server.status, warning: message });
  }
}
