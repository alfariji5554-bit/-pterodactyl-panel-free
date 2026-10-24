```ts
import {
  getRuntimeContext,
  getGitHubConfig,
  githubRequest,
} from "@/lib/runtime/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GitHubRun = {
  id: number;
  name: string;
  display_title: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  path: string;
  created_at: string;
  updated_at: string;
};

function normalizeStatus(run: GitHubRun): string {
  if (run.status === "queued" || run.status === "waiting" || run.status === "pending") {
    return "queued";
  }

  if (run.status === "in_progress") {
    return "online";
  }

  if (run.status === "completed") {
    return "offline";
  }

  return "unknown";
}

export async function GET(request: Request) {
  const context = await getRuntimeContext();

  if (context.response) {
    return context.response;
  }

  const config = getGitHubConfig();

  if (!config) {
    return Response.json(
      { error: "Konfigurasi GitHub runtime belum lengkap di Netlify." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const serverId = url.searchParams.get("serverId")?.trim();

  if (!serverId || !/^[0-9a-f-]{16,64}$/i.test(serverId)) {
    return Response.json(
      { error: "serverId tidak valid." },
      { status: 400 }
    );
  }

  const { data: server, error: serverError } = await context.supabase
    .from("servers")
    .select("id, status")
    .eq("id", serverId)
    .eq("owner_id", context.user!.id)
    .maybeSingle();

  if (serverError) {
    return Response.json(
      { error: "Gagal membaca data server." },
      { status: 500 }
    );
  }

  if (!server) {
    return Response.json(
      { error: "Server tidak ditemukan." },
      { status: 404 }
    );
  }

  try {
    const result = await githubRequest(
      "/actions/runs?per_page=100"
    );

    const runs =
      (result as { workflow_runs?: GitHubRun[] }).workflow_runs || [];

    const expectedPath = `.github/workflows/${config.workflow}`;

    const matchingRuns = runs
      .filter((run) => {
        const sameWorkflow =
          run.path === expectedPath ||
          run.path.endsWith(`/${config.workflow}`);

        const sameServer =
          run.display_title === `runtime-${serverId}`;

        return sameWorkflow && sameServer;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );

    const run = matchingRuns[0];

    if (!run) {
      return Response.json({
        status: server.status || "offline",
        detected: false,
        message:
          "Belum ditemukan workflow runtime untuk server ini. Pastikan workflow memakai run-name yang sesuai.",
      });
    }

    const status = normalizeStatus(run);

    if (
      status !== "unknown" &&
      status !== server.status
    ) {
      const { error: updateError } = await context.supabase
        .from("servers")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", server.id)
        .eq("owner_id", context.user!.id);

      if (updateError) {
        console.error(
          "Gagal memperbarui status server:",
          updateError.message
        );
      }
    }

    return Response.json({
      status,
      detected: true,
      runId: run.id,
      runUrl: run.html_url,
      conclusion: run.conclusion,
      workflowStatus: run.status,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal membaca status GitHub Actions.";

    return Response.json(
      {
        status: server.status || "unknown",
        detected: false,
        warning: message,
      },
      { status: 502 }
    );
  }
}
```
