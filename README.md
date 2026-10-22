# Pterodactyl Panel Free (Netlify + Supabase + GitHub Actions)

Panel Next.js ini memakai Netlify untuk dashboard, Supabase untuk Auth/Database/Storage, dan GitHub Actions sebagai **runner sementara** saat tombol Start ditekan.

> **Batas penting:** ini bukan VPS dan bukan hosting bot 24/7. Job GitHub-hosted runner berakhir saat proses selesai atau batas durasi job tercapai (workflow ini dibatasi 350 menit). Kuota Actions bergantung pada akun/repository. Log proses lengkap dibuka dari link GitHub Actions di halaman server.

## 1. Supabase

1. Buat project Supabase.
2. Buka **SQL Editor**, lalu jalankan `supabase/schema.sql`.
3. Di **Authentication → Users**, buat user admin pertama secara manual. Matikan public sign-ups di pengaturan Auth agar orang lain tidak dapat membuat akun.
4. Di Project Settings → API, salin Project URL, publishable/anon key, dan `service_role` key. `service_role` key adalah rahasia; jangan masukkan ke browser atau repository.
5. Pastikan bucket `server-files` bersifat private. SQL di atas membuat bucket dan policy RLS.

## 2. GitHub Actions runner

Workflow ada di `.github/workflows/runtime.yml`.

Di repository GitHub, buka **Settings → Secrets and variables → Actions**, lalu tambahkan repository secrets:

- `SUPABASE_URL` — URL project Supabase yang sama.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key Supabase. Hanya job pengambilan file yang memakainya; job yang mengeksekusi kode tidak menerima key ini.

Buat fine-grained personal access token untuk repository ini dengan **Actions: Read and write**. Simpan token itu hanya di Netlify sebagai `GITHUB_TOKEN`. Jangan commit token atau kirim token ke chat.

## 3. Environment variables di Netlify

Di **Site configuration → Environment variables**, set variabel berikut:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key |
| `PANEL_ADMIN_EMAIL` | Email user admin yang dibuat di Supabase |
| `GITHUB_OWNER` | Username/organisasi pemilik repository GitHub |
| `GITHUB_REPO` | Nama repository GitHub (tanpa owner dan `.git`) |
| `GITHUB_TOKEN` | Fine-grained token dengan Actions read/write |
| `GITHUB_WORKFLOW_FILE` | `runtime.yml` |
| `GITHUB_REF` | Branch yang berisi workflow, biasanya `main` |

Jangan beri prefix `NEXT_PUBLIC_` pada token atau service-role key. Variabel server-side harus diatur di Netlify UI dan setelah mengubah environment variables lakukan redeploy. Lihat dokumentasi resmi [Netlify environment variables](https://docs.netlify.com/build/configure-builds/environment-variables/) dan [Next.js environment variables](https://nextjs.org/docs/pages/guides/environment-variables).

## 4. Deploy

1. Commit dan push seluruh project ke repository GitHub.
2. Import repository ke Netlify; framework Next.js biasanya terdeteksi otomatis.
3. Set environment variables di atas lalu deploy.
4. Login menggunakan user admin yang dibuat di Supabase.
5. Buat server, upload file (atau ZIP lalu gunakan Extract), lalu pastikan `package.json` dan file entry point ada di root server.
6. Atur Startup Command, misalnya `node index.js` atau `npm start`, lalu tekan Start. Buka link GitHub Actions pada console untuk melihat log runtime.

## Catatan keamanan dan keterbatasan

- Panel hanya mengizinkan email yang cocok dengan `PANEL_ADMIN_EMAIL` pada middleware dan endpoint runtime. RLS membatasi data server ke pemiliknya.
- Runner menjalankan file yang diunggah beserta lifecycle scripts dependency npm. Hanya unggah kode yang kamu percaya. Job eksekusi tidak diberi Supabase service-role key atau GitHub token.
- Berkas disimpan rata di root tiap server (fitur upload saat ini tidak mempertahankan struktur folder bertingkat).
- Start membuat job runner terpisah; Stop membatalkan job GitHub Actions aktif yang cocok dengan ID server.
- Status panel mengikuti status workflow, bukan metrik CPU/RAM yang sesungguhnya.
- Paket ini belum mengirim log streaming langsung ke panel; log lengkap ada di halaman run GitHub Actions.
- Jangan pernah menaruh token GitHub, Supabase service-role key, password, atau `.env` ke GitHub. File `.env` lokal diabaikan oleh `.gitignore`.

## Pengembangan lokal

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Isi `.env.local` dengan nilai milik project sendiri. Jangan gunakan file `.env` yang pernah diunggah/di-commit sebagai konfigurasi produksi.
