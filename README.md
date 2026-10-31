# Fondasi

Boilerplate Next.js + Supabase untuk aplikasi berbayar di Indonesia, dengan pembayaran Midtrans.

- Login email (tanpa password) dan Google
- Row Level Security di semua tabel, dengan test yang jalan tanpa Docker
- Pembayaran lewat sistem driver, dengan Midtrans Snap sebagai driver bawaan: QRIS, transfer bank (VA), GoPay
- Webhook aman: signature diverifikasi, status dicek ulang ke API gateway, nominal dicocokkan, notifikasi dobel tidak memperpanjang langganan dua kali
- Cron pengecek transaksi yang tertahan di pending
- Langganan per periode dengan email pengingat sebelum habis
- Riwayat pembayaran dan kuitansi yang bisa dicetak atau disimpan PDF
- Semua email lewat SMTP standar: Resend, Brevo, Amazon SES, atau penyedia lain

## Mulai

```bash
npx degit alienspace-id/fondasi nama-aplikasimu
cd nama-aplikasimu
npm install
cp .env.example .env.local   # lalu isi, lihat langkah di bawah
npm run dev
```

Buka `http://localhost:3000`.

### 1. Supabase

1. Buat proyek di [supabase.com](https://supabase.com).
2. Di **SQL Editor**, jalankan isi `supabase/migrations/20261101000000_init.sql`, lalu `supabase/seed.sql` (contoh paket; ubah harganya sesuai produkmu). Kalau memakai Supabase CLI: `supabase db push`.
3. Di **Project Settings → API Keys**, salin URL proyek, publishable key, dan secret key ke `.env.local`.
4. Di **Authentication → URL Configuration**, isi **Site URL** dengan alamat aplikasimu, lalu tambahkan `http://localhost:3000/**` dan `https://domainmu.com/**` ke **Redirect URLs**.

### 2. Email login (wajib sebelum dipakai orang lain)

Tanpa SMTP sendiri, Supabase hanya mengirim email login ke anggota tim proyekmu, dengan batas sangat kecil per jam ([dokumentasi](https://supabase.com/docs/guides/auth/auth-smtp)). Pengguna lain tidak akan menerima link masuk.

1. Daftar ke penyedia SMTP, misalnya [Resend](https://resend.com/pricing) (gratis 3.000 email per bulan, 100 per hari), lalu verifikasi domainmu. Domain `resend.dev` hanya untuk uji.
2. Di Supabase, **Authentication → Emails → SMTP Settings**, isi host, port, username, dan password SMTP.
3. Isi kredensial yang sama di `SMTP_*` dan `EMAIL_FROM` di `.env.local`. Aplikasi memakainya untuk kuitansi dan email pengingat.

Saat mencoba di lokal, `SMTP_HOST` boleh dikosongkan: kuitansi dan pengingat hanya dicetak ke terminal.

**Ganti dua template email login (wajib, setelah SMTP terpasang).** Selama proyek masih memakai email bawaan Supabase, editor template di dashboard terkunci. Dengan template bawaan, link masuk hanya berhasil di browser yang sama dengan tempat login diminta. Kalau Gmail membuka link di browser lain, atau email dibuka di HP, login gagal dengan pesan "link tidak valid". Di **Authentication → Emails → Templates**, ganti template **Confirm signup** (dikirim ke pengguna baru) dan **Magic Link** (pengguna lama). Subject keduanya boleh sama, misalnya `Link masuk ke NamaAplikasimu`, dan isinya:

```html
<h2>Masuk</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/akun">Masuk ke akunmu</a></p>
```

**Site URL** di langkah Supabase nomor 4 harus berisi alamat aplikasimu, karena `{{ .SiteURL }}` diambil dari situ.

### 3. Login Google (opsional)

Ikuti [panduan Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) untuk membuat OAuth Client di Google Cloud, lalu aktifkan provider Google di **Authentication → Sign In / Providers**. Aplikasi hanya meminta scope dasar (email dan profil), jadi tidak perlu verifikasi aplikasi dari Google.

Layar izin Google menampilkan `<project-id>.supabase.co`, kecuali kamu menjalani [brand verification](https://support.google.com/cloud/answer/13463073) (gratis, beberapa hari kerja) atau memakai [custom domain Supabase](https://supabase.com/docs/guides/platform/custom-domains) (berbayar).

### 4. Midtrans

1. Daftar di [Midtrans](https://midtrans.com). Akun perorangan cukup KTP untuk QRIS, GoPay, dan transfer bank (VA). BCA VA dan metode lain butuh dokumen tambahan.
2. Di dashboard mode **Sandbox**, **Settings → Access Keys**, salin Server Key ke `MIDTRANS_SERVER_KEY`.
3. Untuk menerima notifikasi di lokal, buka tunnel HTTPS ke port 3000 (`cloudflared tunnel --url http://localhost:3000` atau `ngrok http 3000`), lalu isi **Settings → Configuration → Payment Notification URL** dengan `https://<alamat-tunnel>/api/webhooks/midtrans`.
4. Masuk ke aplikasi, buka **Akun**, pilih paket, lalu bayar dengan [QRIS Simulator](https://simulator.sandbox.midtrans.com/v2/qris/index). Status berubah menjadi lunas dan masa langganan bertambah.

Snap hanya menampilkan metode yang aktif di akunmu. Saat pindah ke production, ganti Server Key dan isi `MIDTRANS_IS_PRODUCTION=true`.

### 5. Cron

Dua endpoint perlu dipanggil terjadwal, dengan header `Authorization: Bearer <CRON_SECRET>`:

| Endpoint | Fungsi | Jadwal yang disarankan |
| --- | --- | --- |
| `/api/cron/pending` | Cek ulang transaksi pending yang notifikasinya tidak sampai | Setiap 15 menit |
| `/api/cron/reminders` | Email pengingat 3 hari sebelum langganan habis | Sekali sehari |

Di Vercel, `vercel.json` sudah mendaftarkan keduanya dan Vercel mengirim header itu otomatis kalau `CRON_SECRET` diisi. Jadwal bawaannya sekali sehari karena paket Hobby [menolak deploy](https://vercel.com/docs/cron-jobs/usage-and-pricing) untuk cron yang lebih sering. Di paket Pro, ubah jadwal `/api/cron/pending` menjadi `*/15 * * * *`.

Coba di lokal:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/pending
```

## Biaya bulanan

Semua layanan punya paket gratis untuk mencoba, tapi aplikasi yang memungut bayaran perlu memperhatikan batasan berikut.

| Layanan | Paket gratis | Yang perlu diperhatikan |
| --- | --- | --- |
| Vercel | Hobby | [Khusus pemakaian non-komersial](https://vercel.com/docs/limits/fair-use-guidelines). Aplikasi berbayar wajib Pro ($20 per bulan). |
| Supabase | Free | Database 500 MB, tanpa backup harian, dan [proyek di-pause](https://supabase.com/docs/guides/platform/project-pausing) setelah seminggu tidak aktif. Pro mulai $25 per bulan ([harga](https://supabase.com/pricing)). |
| Resend | Free | 3.000 email per bulan, 100 per hari, wajib domain terverifikasi. |
| Midtrans | Tanpa biaya bulanan | Potongan per transaksi, misalnya QRIS 0,7%, GoPay 2%, VA Rp4.000 ([harga](https://midtrans.com/id/pricing)). |

Ditambah domain sendiri, yang dibutuhkan untuk SMTP.

## Struktur

| File | Isi |
| --- | --- |
| `supabase/migrations/` | Skema, RLS, dan fungsi `mark_order_paid` / `mark_order_refunded` |
| `lib/auth.ts` | `getUser()` / `requireUser()` untuk melindungi halaman |
| `lib/billing.ts` | Checkout, `settleOrder()`, cek pending, email kuitansi dan pengingat |
| `lib/payments/` | Antarmuka driver (`types.ts`), driver Midtrans, dan daftar driver |
| `lib/email.ts` | Kirim email lewat SMTP |
| `app/akun/` | Halaman akun, status tagihan, dan kuitansi |
| `app/api/webhooks/[driver]/` | Notifikasi pembayaran, misalnya `/api/webhooks/midtrans` |
| `app/api/cron/` | Endpoint cron |
| `tests/` | Test RLS (PGlite) dan test signature Midtrans |

## Menambah gateway pembayaran

1. Buat `lib/payments/namagateway.ts` yang mengimplementasikan `PaymentDriver` dari `lib/payments/types.ts`: membuat transaksi, memverifikasi notifikasi, dan mengambil status.
2. Daftarkan di `lib/payments/index.ts`.
3. Isi `PAYMENT_DRIVER=namagateway`. Webhook-nya otomatis tersedia di `/api/webhooks/namagateway`.

Order lama tetap dicek ke gateway yang tercatat di kolom `provider`, jadi transaksi yang sedang berjalan tidak rusak saat pindah gateway.

## Test

```bash
npm test
```

Test RLS memakai [PGlite](https://pglite.dev) (Postgres yang berjalan di Node), jadi tidak butuh Docker. Test memastikan semua tabel memakai RLS, pengguna tidak bisa membaca atau mengubah data orang lain, dan pembayaran yang sama tidak bisa memperpanjang langganan dua kali.

PGlite meniru role dan `auth.uid()` Supabase, bukan Supabase sungguhan. Kalau kamu memakai fitur Supabase lain di policy (misalnya `auth.jwt()`), tambahkan tiruannya di `tests/supabase-stub.sql`.

## Versi Pro

Versi Pro sedang disiapkan untuk operasional jualan: panel admin (pengguna, transaksi, paket), transfer manual dengan verifikasi admin untuk berjualan sebelum akun gateway aktif, kode promo dan kuota harga, serta fitur hak data pengguna. Daftar waitlist di [fondasi.pages.dev](https://fondasi.pages.dev/?ref=github) untuk harga early bird.

## Batasan

- **Kuitansi bukan faktur pajak.** Pengusaha yang belum PKP [tidak boleh menerbitkan faktur pajak](https://www.online-pajak.com/tentang-efaktur-ppn/non-pkp-menerbitkan-faktur-pajak/).
- **Tidak ada auto-debit.** Pengguna memperpanjang sendiri setelah menerima email pengingat. Langganan otomatis di Midtrans butuh persetujuan bank atau tim sales, jadi tidak bisa diaktifkan akun perorangan.
- **Refund dilakukan dari dashboard gateway.** Setelah itu, notifikasi atau cron mengubah status order menjadi dikembalikan dan masa langganan dikurangi.

## Lisensi

[MIT](LICENSE). Bebas dipakai untuk proyek pribadi maupun komersial, termasuk proyek klien.
