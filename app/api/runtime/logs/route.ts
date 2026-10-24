import { getRuntimeContext } from "@/lib/runtime/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await getRuntimeContext();

  if (context.response) {
    return context.response;
  }

  const url = new URL(request.url);
  const serverId = url.searchParams.get("serverId")?.trim();
  const after = Number(url.searchParams.get("after") || "0");

  if (!serverId || !/^[0-9a-f-]{16,64}$/i.test(serverId)) {
    return Response.json(
      { error: "serverId tidak valid." },
      { status: 400 }
    );
  }

  const { data: server, error: serverError } = await context.supabase
    .from("servers")
    .select("id")
    .eq("id", serverId)
    .eq("owner_id", context.user!.id)
    .maybeSingle();

  if (serverError || !server) {
    return Response.json(
      { error: "Server tidak ditemukan." },
      { status: 404 }
    );
  }

  let query = context.supabase
    .from("runtime_logs")
    .select("id, log_level, message, created_at")
    .eq("server_id", serverId)
    .order("id", { ascending: true })
    .limit(200);

  if (Number.isSafeInteger(after) && after > 0) {
    query = query.gt("id", after);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json(
      { error: "Gagal membaca log runtime.", detail: error.message },
      { status: 500 }
    );
  }

  return Response.json({
    logs: data || [],
    lastId: data?.length ? data[data.length - 1].id : after,
  });
}
