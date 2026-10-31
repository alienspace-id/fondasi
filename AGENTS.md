# Aturan untuk AI coding agent

Proyek ini aplikasi Next.js 16 (App Router) + Supabase dengan pembayaran lewat driver (bawaan: Midtrans Snap). Ikuti aturan di bawah setiap kali mengubah kode.

## Next.js 16

Next.js 16 berbeda dari yang mungkin ada di data latihanmu: middleware kini bernama `proxy.ts`, dan `params` serta `searchParams` adalah Promise. Baca panduan di `node_modules/next/dist/docs/` sebelum memakai API yang belum pernah dipakai di proyek ini.

## Keamanan data

- Setiap tabel baru di schema `public` wajib `enable row level security` dan punya policy. `npm test` gagal kalau ada tabel tanpa RLS.
- Tambahkan test di `tests/rls.test.ts` untuk setiap tabel atau policy baru: pengguna A tidak boleh membaca atau mengubah data pengguna B.
- Supabase memberi hak UPDATE ke semua kolom secara default. Kalau pengguna hanya boleh mengubah sebagian kolom, `revoke update` lalu `grant update (kolom)`.
- Perubahan skema ditulis sebagai file baru di `supabase/migrations/`. Jangan mengubah migrasi yang sudah dijalankan.
- Halaman dan Server Action yang membaca data pengguna memakai `createClient()` dari `lib/supabase/server.ts` (tunduk RLS). `supabaseAdmin()` hanya untuk webhook, cron, dan pembuatan order.
- Untuk memeriksa login, pakai `getUser()` / `requireUser()` dari `lib/auth.ts` (berbasis `getClaims`). Jangan pakai `getSession()` untuk keputusan akses.
- `SUPABASE_SECRET_KEY`, `MIDTRANS_SERVER_KEY`, `SMTP_PASS`, dan `CRON_SECRET` tidak boleh diawali `NEXT_PUBLIC_` atau dipakai di file `"use client"`.

## Pembayaran

- Nominal selalu dibaca server dari tabel `plans`. Jangan menerima harga dari browser.
- Akses hanya diberikan oleh `settleOrder()` di `lib/billing.ts`, yang mengecek status ke API gateway. Callback atau parameter URL dari halaman bayar tidak boleh mengubah status.
- Status order hanya maju: `pending` ke `paid` atau `failed`, `paid` ke `refunded`. Perubahan ke `paid` hanya lewat fungsi database `mark_order_paid`, supaya notifikasi dobel tidak memperpanjang langganan dua kali.
- Gateway baru ditambahkan sebagai driver di `lib/payments/` yang mengimplementasikan `PaymentDriver`, lalu didaftarkan di `lib/payments/index.ts`. Jangan memanggil API gateway langsung dari halaman atau route.

## Email

Semua email lewat `sendEmail()` di `lib/email.ts` (SMTP standar). Jangan menambah SDK penyedia email tertentu.

## Sebelum selesai

Jalankan `npm run typecheck`, `npm test`, dan `npm run build`. Ketiganya harus lolos.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
