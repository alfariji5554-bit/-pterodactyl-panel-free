export default function SetupRequiredPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-panel-bg text-white">
      <section className="max-w-lg rounded-xl border border-panel-border bg-panel-card p-6">
        <h1 className="text-xl font-semibold mb-3">Konfigurasi admin belum lengkap</h1>
        <p className="text-sm text-panel-muted">
          Atur environment variable <code>PANEL_ADMIN_EMAIL</code> di Netlify ke email akun admin Supabase,
          lalu deploy ulang. Halaman dashboard tetap terkunci sampai konfigurasi ini tersedia.
        </p>
      </section>
    </main>
  );
}
