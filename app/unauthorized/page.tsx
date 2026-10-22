import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-panel-bg text-white">
      <section className="max-w-lg rounded-xl border border-panel-border bg-panel-card p-6">
        <h1 className="text-xl font-semibold mb-3">Akses ditolak</h1>
        <p className="text-sm text-panel-muted mb-5">
          Email akun ini tidak cocok dengan PANEL_ADMIN_EMAIL yang diizinkan untuk panel.
        </p>
        <Link href="/" className="text-panel-accent hover:underline">Kembali ke login</Link>
      </section>
    </main>
  );
}
