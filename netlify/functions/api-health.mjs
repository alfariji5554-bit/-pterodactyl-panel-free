// Contoh endpoint HTTP Netlify Function.
// Endpoint ini hanya untuk memverifikasi fungsi Netlify aktif; bukan API game lengkap.
export default async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "battle-x-ground-http-starter",
      mode: "health-only",
      note: "This endpoint does not run Socket.IO or a persistent game server."
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
};
