# Panduan Admin Hulao

Manual lengkap untuk admin yang mengelola platform Hulao (WhatsApp AI CS + Landing Page Builder + Subscription).

> **Versi**: 2026-05-07 · **Untuk admin akun:** `laptopgratis@gmail.com` (role ADMIN) atau staf dengan role `FINANCE`.

---

## Daftar Isi

1. [Pengantar Singkat](#1-pengantar-singkat)
2. [Login & Akses Admin](#2-login--akses-admin)
3. [Dashboard Admin](#3-dashboard-admin)
4. [Manajemen User](#4-manajemen-user)
5. [AI Models — kelola model yang tersedia](#5-ai-models)
6. [API Keys Provider](#6-api-keys-provider)
7. [Token Packages — paket beli token](#7-token-packages)
8. [Pricing Settings — global pricing platform](#8-pricing-settings)
9. [Pricing Calculator — hitung margin per model](#9-pricing-calculator)
10. [AI Pricing Database — data harga provider](#10-ai-pricing-database)
11. [Profitability — laporan margin pesan](#11-profitability)
12. [Bank Accounts — rekening transfer manual](#12-bank-accounts)
13. [Finance — verifikasi transfer manual token](#13-finance)
14. [LP Packages & LP Upgrades](#14-lp-packages--lp-upgrades)
15. [Subscriptions — kelola langganan LP](#15-subscriptions)
16. [Soul Settings — kepribadian + gaya AI](#16-soul-settings)
17. [Soul Lab — uji efektivitas Soul](#17-soul-lab)
18. [Site Settings](#18-site-settings)
19. [Operasional VPS](#19-operasional-vps)
20. [Troubleshooting Umum](#20-troubleshooting-umum)
21. [Glossary Istilah](#21-glossary-istilah)

---

## 1. Pengantar Singkat

**Hulao** adalah platform SaaS dengan tiga fitur utama:

1. **WhatsApp AI Customer Service** — user beli token, hubungkan WA via QR, set "Soul" (kepribadian AI), AI otomatis balas pesan customer.
2. **Landing Page Builder** — user bikin halaman promosi (LP) dengan AI atau manual, public-accessible via `hulao.id/p/<slug>`.
3. **Subscription Plan** — user upgrade plan LP (FREE/STARTER/POPULAR/POWER) bayar bulanan/tahunan, dapat lebih banyak LP, storage, AI generate, custom domain.

**Tugas admin:**

- Kelola model AI + harga
- Verifikasi pembayaran manual transfer (token + subscription)
- Pantau profitabilitas (margin per pesan AI)
- Set paket harga + diskon
- Konfigurasi rekening bank, info platform
- Edit Soul presets (Personality + Style) yang dipakai user via dropdown
- Monitor kapasitas server (disk, storage, user per tier)
- Re-aktifkan user yang ke-pause dari token habis
- Tangani komplain via inbox/email

---

## 2. Login & Akses Admin

### 2.1 Login

URL: **https://hulao.id/login**

Login dengan email + password admin. Setelah berhasil, kamu otomatis masuk ke `/admin/dashboard` (admin) atau `/admin/finance` (finance role).

### 2.2 Role yang ada

| Role | Akses |
|---|---|
| `ADMIN` | Semua menu /admin/* + /dashboard/* |
| `FINANCE` | Hanya /admin/finance/* (verifikasi transfer manual) |
| `USER` | Hanya /dashboard/* (pengguna platform biasa) |

### 2.3 Promote user ke ADMIN/FINANCE

Lewat halaman `/admin/users`, klik user → ubah role. Atau via SQL kalau perlu:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'staf@example.com';
```

> ⚠️ **Auto-promote via email**: kalau env `ADMIN_EMAIL` cocok dengan email user yang baru daftar via Google OAuth, sistem otomatis set role ADMIN (lihat `lib/auth.ts:events.createUser`).

### 2.4 Reset Password Sendiri

Lupa password? Klik "Lupa password?" di halaman login → cek email → ikut link reset.

Kalau email belum dikonfigurasi (sandbox mailtrap), bisa reset langsung via DB:

```bash
docker exec hulao-postgres psql -U hulao -d hulao -c \
  "UPDATE \"User\" SET password = '<bcrypt-hash>' WHERE email = 'admin@example.com';"
```

(Generate hash dengan `node -e "console.log(require('bcryptjs').hashSync('NewPass123', 10))"`)

---

## 3. Dashboard Admin

URL: **/admin/dashboard**

Menampilkan:

- **Total User** — semua user terdaftar
- **Total Pendapatan** — sum payment status SUCCESS
- **Token Terjual** — sum tokenTransaction tipe PURCHASE
- **WA Aktif** — session WhatsApp dengan status CONNECTED
- **Soul Token Budget** — estimasi cost token-platform yang dipakai
- **Server Status** — disk usage, total uploads, user per tier, top 5 user by storage (lihat [§19.4](#194-monitor-storage--server))
- **Pembayaran Sukses Terbaru** — 10 transaksi terakhir

Refresh halaman untuk update terbaru.

---

## 4. Manajemen User

URL: **/admin/users**

Lihat semua user terdaftar:
- Email, nama, role, tanggal daftar
- Saldo token
- Session WhatsApp connected
- Status (ACTIVE/INACTIVE)

**Aksi:**
- **Promote ke ADMIN/FINANCE** — ubah role
- **Tambah saldo token manual** — bonus admin (akan tercatat di TokenTransaction tipe BONUS)
- **Hapus user** — cascade delete semua data terkait (kontak, pesan, sesi WA, LP)

> ⚠️ Hapus user **tidak bisa dibatalkan**. Pastikan kamu yakin sebelum konfirmasi.

---

## 5. AI Models

URL: **/admin/models**

Daftar model AI yang tersedia untuk user. Default seed punya 5 model:

| Model | Provider | costPerMessage | Cocok Untuk |
|---|---|---|---|
| Claude Haiku | Anthropic | 1 token | CS standar, paling hemat |
| Claude Sonnet | Anthropic | 4 token | Komplain kompleks, reasoning |
| GPT-5 Mini | OpenAI | 4 token | CS sehari-hari |
| Gemini 2.0 Flash | Google | 1 token | Paling hemat, super cepat |
| Gemini 2.5 Pro | Google | 13 token | Reasoning paling kompleks |

### 5.1 Field penting

- **costPerMessage** — token platform yg dipotong dari user per balasan AI sukses
- **costMode** — `AUTO` (otomatis dihitung dari PricingSettings) atau `MANUAL` (admin set langsung)
- **inputPricePer1M / outputPricePer1M** — harga real provider USD per 1M token (untuk hitung margin)
- **avgTokensPerMessage** — estimasi rata-rata token per balasan (~500 default)
- **isActive** — kalau false, user tidak bisa pilih model ini di /soul

### 5.2 Update harga

Saat provider mengubah harga (mis. Anthropic naikkan harga Sonnet):

1. Update di `/admin/ai-pricing` (data referensi)
2. Klik "Sync ke AI Models" (atau update manual di `/admin/models`)
3. Kalau costMode `AUTO`: klik tombol "Re-calculate" di model — sistem hitung ulang `costPerMessage` berdasarkan target margin (lihat [§8](#8-pricing-settings))

### 5.3 Restrict akses model per user

Kalau mau model premium (Sonnet/Pro) cuma bisa dipakai user tertentu:

- Set `isActive: false` di model — user umum tidak lihat di dropdown
- Tambahkan ke `UserModelAccess` table untuk user spesifik (admin SQL atau via API custom)

---

## 6. API Keys Provider

URL: **/admin/api-keys**

Simpan API key Anthropic / OpenAI / Google secara terenkripsi (AES-256-GCM) di DB.

### 6.1 Cara setup

1. Klik "Tambah API Key"
2. Pilih provider (ANTHROPIC / OPENAI / GOOGLE)
3. Paste API key dari dashboard provider
4. Klik "Test koneksi" — kalau hijau ✓, simpan

### 6.2 Source-of-truth

API key bisa berasal dari:
- **Env file** (`.env.production`: `ANTHROPIC_API_KEY=...`) — paling sederhana, tapi rotasi perlu restart container
- **DB encrypted** — bisa di-rotate tanpa restart, ditampilkan masked di UI

> ⚠️ **JANGAN set di dua tempat sekaligus**. Kode di `wa-service/src/ai-keys.ts` cek DB dulu (cache 60s), fallback ke env. Pilih satu source supaya tidak bingung.

### 6.3 Test all

Tombol "Test All" akan validate semua key sekaligus — tampilkan hijau/merah per provider.

---

## 7. Token Packages

URL: **/admin/packages**

Paket beli token yang user lihat di `/billing`. Default 3 paket:

| Paket | Token | Harga |
|---|---|---|
| Starter | 10.000 | Rp 35.000 |
| Popular | 50.000 | Rp 149.000 |
| Power | 200.000 | Rp 499.000 |

### 7.1 Edit harga

Klik paket → ubah `price`, `tokenAmount`, `name`, `isPopular` → Save.

Perubahan langsung berlaku di halaman `/billing` user.

### 7.2 Tambah paket baru

Klik "Tambah Paket". Field wajib:
- `name` (mis. "Hemat", "Bisnis")
- `tokenAmount`
- `price` (Rupiah)
- `sortOrder` (urutan tampil; kecil = atas)

### 7.3 Non-aktifkan paket

Set `isActive: false` — user tidak lihat di list, tapi user yg dulu beli paket itu tetap valid.

---

## 8. Pricing Settings

URL: **/admin/pricing-settings**

Singleton yang dipakai sistem untuk hitung biaya & margin.

| Field | Default | Fungsi |
|---|---|---|
| `usdRate` | 16.000 | Kurs USD→IDR untuk konversi cost provider AI |
| `pricePerToken` | 2 IDR | Harga jual platform per 1 token (untuk hitung pendapatan) |
| `marginTarget` | 50% | Target margin minimum — Pricing Calculator pakai ini untuk rekomendasi |
| `estimatedInputTokens` | 1.600 | Rata-rata input prompt+history per pesan (untuk estimate cost) |
| `estimatedOutputTokens` | 300 | Rata-rata output AI per pesan |

### 8.1 Kapan update?

- **usdRate** — saat USD bergerak signifikan (>2%). Cek bi.go.id atau xe.com mingguan. Pengaruh besar ke `apiCostRp` dan margin.
- **pricePerToken** — saat mau naik/turunkan harga jual user.
- **marginTarget** — kalau mau lebih agresif (margin tinggi) atau lebih kompetitif.
- **estimatedInputTokens / estimatedOutputTokens** — adjust kalau real usage beda jauh dari estimate (cek di `/admin/profitability`).

> ⚠️ Setelah ubah, semua `costPerMessage` mode AUTO **tidak otomatis re-calculate**. Klik tombol "Re-calculate semua model" di `/admin/models` setelah simpan.

---

## 9. Pricing Calculator

URL: **/admin/pricing-calculator**

Tools untuk simulasi `costPerMessage` per model dengan margin target.

**Workflow:**

1. Pilih model dari dropdown (atau input manual harga input/output USD per 1M)
2. Set `usdRate`, `pricePerToken`, `marginTarget` dari Pricing Settings (auto-load)
3. Lihat hasil: `costPerMessage` rekomendasi, margin %, profit per pesan

**Tombol "Apply ke model X"** — langsung update `AiModel.costPerMessage` dengan nilai rekomendasi (mode AUTO).

---

## 10. AI Pricing Database

URL: **/admin/ai-pricing**

Database harga API per model dari provider. Source-of-truth untuk model dropdown di `/admin/models`.

### 10.1 Update via AI Research

Klik tombol "🔍 Riset Harga via AI" — sistem panggil Claude (web_search) untuk cek harga terkini provider, parse JSON, simpan ke `AiModelPreset`.

Ini bisa dijalankan mingguan/bulanan supaya harga model selalu update tanpa research manual.

### 10.2 Update manual

Klik baris model → ubah harga → Save.

### 10.3 Pakai di Models

Saat tambah model baru di `/admin/models`, dropdown "Model ID" akan auto-fetch dari preset di sini → harga otomatis terisi.

---

## 11. Profitability

URL: **/admin/profitability**

Laporan margin per pesan AI sebenarnya (bukan estimasi).

**Setiap pesan AI yang sukses dihitung:**
- `apiInputTokens`, `apiOutputTokens` — token aktual dari provider
- `apiCostRp` — cost real (input × inputPricePer1M + output × outputPricePer1M) × usdRate
- `tokensCharged` — token platform yg dipotong user (snapshot `costPerMessage`)
- `revenueRp` = `tokensCharged` × `pricePerToken`
- `profitRp` = `revenueRp` - `apiCostRp`

### 11.1 Filter & view

- Per model — lihat `/admin/profitability/by-model`
- Per session — lihat per WA session user
- Per range tanggal — bulanan/mingguan
- Export CSV — tombol "Download CSV"

### 11.2 Alert margin negatif

Sistem auto-generate alert kalau ada model dengan margin negatif (lihat di sidebar bell icon admin). Tindakan:

1. Cek model mana yg rugi
2. Naikkan `costPerMessage` di model itu (atau ubah `marginTarget` global)
3. Atau set model jadi `isActive: false` kalau memang gak menguntungkan

---

## 12. Bank Accounts

URL: **/admin/bank-accounts**

Rekening tujuan transfer manual user. User akan lihat ini di:
- `/billing` saat pilih "Transfer Manual" untuk beli token
- `/upgrade` saat pilih "Manual Transfer" untuk subscription

### 12.1 Tambah rekening

Klik "Tambah Rekening". Field:
- `bankName` (BCA, Mandiri, dll)
- `accountNumber`
- `accountName` (sesuai buku tabungan, **case-sensitive**)
- `isActive` — user lihat hanya yg aktif

### 12.2 Banyak rekening

Sistem ambil rekening **pertama** yang aktif untuk display. Kalau banyak, hanya yg paling atas yg dipakai. Untuk multi-rekening, perlu modify code (display semua).

---

## 13. Finance

URL: **/admin/finance**

Daftar `ManualPayment` yg menunggu konfirmasi. Khusus untuk pembelian **token via transfer manual** (bukan subscription).

### 13.1 Verifikasi pembayaran

1. User upload bukti transfer di `/billing` → status `PENDING`
2. Admin/Finance buka `/admin/finance` → lihat list
3. Klik baris pembayaran → cek bukti gambar
4. Bandingkan nominal di bukti vs `totalAmount` (= harga + uniqueCode)
5. Kalau cocok: klik **"Konfirmasi"** → token otomatis ditambah ke saldo user
6. Kalau salah: klik **"Tolak"** → kasih alasan, user akan dapat notifikasi

### 13.2 Field yg perlu dicek

- `uniqueCode` — angka 100-999 di akhir nominal. Ini cara identify pengirim. Mis. user A bayar 35.124, user B bayar 35.357 → mutasi rekening ada `35.124` = user A.
- `proofUrl` — gambar bukti transfer (preview di modal)
- `proofNote` — catatan user (mis. "Transfer dari rekening X jam 10")
- `confirmedBy` — auto-tracked siapa yang approve

### 13.3 Race condition

Kalau dua admin approve bersamaan, sistem cuma izinkan satu (idempotent — yg duluan menang, yg kedua dapat error "already confirmed").

### 13.4 Subscription vs token transfer

| | Halaman approve | Tabel |
|---|---|---|
| **Token transfer manual** | `/admin/finance` | `ManualPayment` |
| **Subscription transfer manual** | `/admin/subscriptions` (tab Pending) | `SubscriptionInvoice` |

Beda halaman, beda tabel. Jangan tertukar.

---

## 14. LP Packages & LP Upgrades

URL: **/admin/lp-packages** dan **/admin/lp-upgrades**

### 14.1 LP Packages

Default seed punya 3 paket:

| Paket | Tier | Max LP | Storage | Harga (legacy one-time) | priceMonthly (subscription) |
|---|---|---|---|---|---|
| Starter | STARTER | 3 | 20 MB | Rp 29.000 | Rp 29.000 |
| Popular | POPULAR | 10 | 100 MB | Rp 79.000 | Rp 79.000 |
| Power | POWER | 999 | 500 MB | Rp 199.000 | Rp 199.000 |

### 14.2 Field

- **price** (legacy) — dipertahankan untuk grandfathered user yg upgrade lewat sistem lama (one-time, lifetime). Bisa dihapus dari UI kalau tidak relevan.
- **priceMonthly** — dipakai sistem subscription. Total harga subscription = `priceMonthly × durationMonths` lalu dikurangi diskon (10/15/20% untuk 3/6/12 bulan).
- **maxLp** — limit jumlah landing page user di tier ini
- **maxStorageMB** — limit total storage gambar LP (rasio compress sharp ~80% saving)

### 14.3 Edit harga

Klik paket → ubah `priceMonthly` → Save.

Perubahan langsung tampil di `/pricing` (server-side rendered).

### 14.4 LP Upgrades (legacy)

Halaman `/admin/lp-upgrades` adalah list `ManualPayment` purpose `LP_UPGRADE` (one-time purchase legacy). Setelah subscription system live (2026-05-07), flow ini di-deprecate. User yg sudah pakai → tetap valid via grandfathering.

---

## 15. Subscriptions

URL: **/admin/subscriptions**

Kelola semua langganan plan LP user. **Critical untuk operasional revenue.**

### 15.1 Tab "Aktif"

List semua subscription status `ACTIVE`. Per row:
- User (email + nama)
- Plan + tier
- Durasi (1/3/6/12 bulan, atau "∞" untuk lifetime grandfathered)
- End date + sisa hari
- Harga
- Status

### 15.2 Tab "Pending" — **PALING SERING DIPAKAI**

List subscription dengan invoice butuh action:
- `WAITING_CONFIRMATION` — user sudah upload bukti transfer, **butuh kamu approve/reject**
- `PENDING` — invoice belum ada bukti (user belum upload)

**Workflow approve manual transfer:**

1. Buka tab Pending
2. Cari row dengan status `WAITING_CONFIRMATION`
3. Klik **"Cek Bukti"** — modal terbuka dengan:
   - Detail invoice (nomor, total, kode unik)
   - Catatan user
   - Foto bukti transfer
4. Bandingkan nominal di bukti vs `total` (harus persis termasuk kode unik)
5. **Klik "Approve & Aktifkan"** kalau cocok:
   - Invoice → `PAID`
   - Subscription → `ACTIVE`
   - User dapat notifikasi sukses (in-app + WA kalau ada)
   - User tier otomatis upgrade
6. **Klik "Reject"** kalau bermasalah:
   - Isi alasan reject (wajib, mis. "Nominal tidak cocok, kurang Rp 274")
   - Invoice → `CANCELLED`, Subscription → `CANCELLED`
   - User dapat notifikasi penolakan dengan alasan

### 15.3 Tab "Semua"

Riwayat semua subscription (active/pending/expired/cancelled). Filter via `status=` query param.

### 15.4 Aksi via API admin

| Endpoint | Fungsi |
|---|---|
| `POST /api/admin/subscriptions/[id]/extend` body `{months, reason}` | Perpanjang manual (mis. kompensasi outage 1 bulan) |
| `POST /api/admin/subscriptions/[id]/cancel` body `{reason}` | Admin cancel subscription user |

Belum ada UI untuk extend; bisa via curl:

```bash
curl -X POST -H "Cookie: <admin-session>" -H "Content-Type: application/json" \
  -d '{"months":1,"reason":"Kompensasi server downtime"}' \
  https://hulao.id/api/admin/subscriptions/<id>/extend
```

### 15.5 Auto-expire & reminder

Cron daily handle ini otomatis (lihat [§19.3](#193-cron-jobs)). **Tidak perlu admin manual.**

- 7/3/1 hari sebelum expire → user dapat reminder in-app + WA
- Tepat di hari expire → status `EXPIRED`, user auto-downgrade ke FREE

---

## 16. Soul Settings

URL: **/admin/soul-settings**

Curated **Personality** + **Style** yang user pilih lewat dropdown SoulBuilder.

### 16.1 Soul Personality

Karakter agen AI. Default 4 publik:
- Sales Closing (teknik SPIN)
- CS Profesional (formal)
- CS Ramah (hangat, emoji)
- CS Santai (casual)

Plus 4 buyer-tester (untuk Soul Lab):
- Pembeli Ragu
- Pembeli Galak
- Pembeli Pelit
- Pembeli Korporat

### 16.2 Soul Style

Gaya balas. Default 4:
- Closing dengan Pilihan
- Singkat & Padat
- Detail & Informatif
- Storytelling

### 16.3 Field penting

- **name** — yg user lihat di dropdown
- **description** — yg user lihat di dropdown (1 line subtitle)
- **systemPromptSnippet** — **RAHASIA**, hanya admin yg lihat. Ini yg disuntik ke system prompt AI.
- **isActive** — kalau false, tidak muncul di dropdown user
- **order** — urutan (kecil = atas). Order >=10 untuk buyer-tester (supaya tidak dominan di dropdown user reguler)

### 16.4 Edit snippet

Snippet adalah inti dari "kepribadian" AI. Hati-hati editing — kesalahan kalimat bisa bikin AI bertingkah aneh. Test di Soul Lab dulu (lihat [§17](#17-soul-lab)).

### 16.5 Tambah personality/style baru

Klik "Tambah" → isi semua field → Save.

User akan langsung lihat di dropdown SoulBuilder saat next page load.

---

## 17. Soul Lab

URL: **/admin/soul-lab**

Simulator dialog 2 AI: **penjual (yg di-test)** vs **pembeli (tester)**. Dipakai untuk uji efektivitas Soul sebelum di-deploy ke real customer.

### 17.1 Setup simulasi

1. **Setup Penjual:**
   - Pilih Personality + Style (atau Soul lengkap)
   - Pilih Model AI (mis. Sonnet untuk simulasi premium)
   - Isi `sellerContext` — info bisnis (produk, harga, promo, FAQ)
2. **Setup Pembeli:**
   - Pilih buyer-tester (Ragu/Galak/Pelit/Korporat)
   - Pilih model AI (rekomendasi: Haiku — hemat untuk tester)
   - Isi `buyerScenario` — situasi & motivasi pembeli
3. **Pengaturan ronde:**
   - `totalRounds` (default 10)
   - `starterRole` (siapa yg buka chat)
   - `starterMessage` (pesan pembuka)
4. Klik **"Mulai Simulasi"**

### 17.2 Hasil

Setelah selesai, lihat:
- **Conversation** — full transcript chat
- **evaluationScore** — skor 0-100 (apakah penjual berhasil closing)
- **outcome** — `SOLD` / `REJECTED` / `INCONCLUSIVE`
- **Cost** — token + IDR yg dihabiskan

### 17.3 Use case admin

- Test Soul personality baru sebelum kasih ke user — pastikan AI tidak kebablasan / OOC
- Compare 2 personality untuk produk yg sama
- Identify weak point (mis. AI gagap saat customer kasih objection harga)
- Iterate snippet → re-test → loop

### 17.4 Cost

Simulasi 10 ronde dengan Haiku+Haiku = ~Rp 100-300 (bayar dari saldo admin yg trigger). Sonnet+Sonnet = ~Rp 1.000-3.000. Set budget alert di Pricing Settings kalau perlu.

### 17.5 Preset

Simpan setup yg sering dipakai sebagai preset (`SoulSimulationPreset`). Klik "Save as Preset" setelah setup.

---

## 18. Site Settings

URL: **/admin/settings**

Key-value config platform. Saat ini ada 3 key:

| Key | Default | Fungsi |
|---|---|---|
| `WA_ADMIN` | (kosong) | Nomor WA admin yg dipakai sistem untuk kirim notif (subscription reminder, sales flow notif). Format: 62xxxxxxx tanpa 0/+ |
| `PLATFORM_NAME` | Hulao | Nama platform yg muncul di email, footer, dll |
| `SUPPORT_EMAIL` | (kosong) | Email support yg user lihat di footer / contact |

> ⚠️ `WA_ADMIN` **bukan** WA session admin yg connected. Itu adalah nomor tujuan saat sales flow user complete (admin dapat notif "Customer X sudah order"). Untuk kirim WA dari admin ke user, pakai session WA admin yg connected (lihat `lib/services/subscription.ts:findAdminWaSessionId`).

### 18.1 Update

Klik field → input → Save.

---

## 19. Operasional VPS

### 19.1 Backup Database

**Otomatis tiap hari jam 03:00 UTC (10:00 WIB)** via cron.

- Script: `/usr/local/bin/hulao-db-backup.sh`
- Output: `/var/backups/hulao/hulao-YYYYMMDD-HHMMSS.sql.gz`
- Retensi: 30 hari (auto-delete yg lebih lama)
- Log: `/var/log/hulao-db-backup.log`

#### Manual backup

```bash
sudo /usr/local/bin/hulao-db-backup.sh
```

#### Restore dari backup

```bash
# Stop nextjs (jangan ada koneksi aktif saat restore)
docker stop hulao-nextjs hulao-wa-service

# Drop & restore
docker exec -i hulao-postgres psql -U hulao -d hulao -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
zcat /var/backups/hulao/hulao-20260507-030000.sql.gz | docker exec -i hulao-postgres psql -U hulao -d hulao

# Start ulang
docker start hulao-wa-service hulao-nextjs
```

> ⚠️ Restore akan **mengganti semua data**. Pastikan kamu pilih backup yg benar.

### 19.2 Backup off-site (REKOMENDASI)

Backup lokal di VPS yg sama = single point of failure. Setup off-site backup:

```bash
# Install rclone
apt install rclone

# Setup remote (Backblaze B2 / Google Drive / dll) — interactive
rclone config

# Tambah ke /usr/local/bin/hulao-db-backup.sh setelah `find ... -delete`:
rclone copy /var/backups/hulao/ remote:hulao-backups/ --include "*.sql.gz"
```

Cost ~$0.10/bulan untuk 5 GB di B2.

### 19.3 Cron Jobs

Lihat semua: `crontab -l`

| Cron | Jadwal UTC | WIB | Fungsi |
|---|---|---|---|
| `hulao-db-backup.sh` | 03:00 daily | 10:00 | Backup DB |
| `subscription-expire` | 17:30 daily | 00:30 (besok) | Auto-downgrade subscription expired |
| `subscription-reminder` | 02:00 daily | 09:00 | Reminder 7/3/1 hari sebelum expire |
| `invoice-expire` | :15 hourly | :15 hourly | Cancel invoice PENDING > 24 jam |

Log subscription crons: `/var/log/hulao-cron.log`

#### Trigger manual

```bash
/usr/local/bin/hulao-cron-call.sh subscription-reminder
/usr/local/bin/hulao-cron-call.sh subscription-expire
/usr/local/bin/hulao-cron-call.sh invoice-expire
```

### 19.4 Monitor Storage & Server

URL: **/admin/dashboard** → card "Server & Storage Status"

Tampilkan:
- Disk root (used / total / %)
- Total uploads (GB + jumlah file)
- User per tier (FREE/STARTER/POPULAR/POWER)
- Top 5 user by storage usage
- LP stats (total, published, draft)
- Visit 30 hari terakhir

### 19.5 Cleanup file orphan

Otomatis tiap hari via cron `cleanup-lp` (kalau diaktifkan). Cek manual:

```bash
docker exec hulao-nextjs node -e "
fetch('http://localhost:3000/api/cron/cleanup-lp', {
  method: 'POST',
  headers: { 'x-cron-secret': process.env.CRON_SECRET }
}).then(r => r.json()).then(console.log)
"
```

Output: jumlah `LpVisit` >90 hari yg dihapus, file orphan yg dibersihkan.

### 19.6 Cleanup build cache Docker

Build cache Docker membengkak setiap kali kamu deploy. Sekarang ~14GB. Bersihkan:

```bash
docker builder prune -af
```

Atau set auto-GC di `/etc/docker/daemon.json`:

```json
{
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "5GB",
      "policy": [{"keepStorage": "5GB", "all": true}]
    }
  }
}
```

Lalu `systemctl restart docker` (downtime ~10 detik untuk semua container).

### 19.7 View Logs

```bash
# Application logs
docker logs hulao-nextjs --tail 100
docker logs hulao-wa-service --tail 100
docker logs hulao-postgres --tail 100

# Cron logs
tail -f /var/log/hulao-cron.log
tail -f /var/log/hulao-db-backup.log

# Filter error nextjs
docker logs hulao-nextjs 2>&1 | grep -iE "error|fail|exception"
```

### 19.8 Restart container

```bash
cd /var/www/wa-cs-platform

# Restart satu service
docker compose --env-file .env.production restart nextjs

# Restart semua
docker compose --env-file .env.production restart

# Force recreate (kalau ada perubahan compose / env)
docker compose --env-file .env.production up -d --force-recreate
```

### 19.9 Update Aplikasi (Deploy Code Baru)

```bash
cd /var/www/wa-cs-platform

# Pull terbaru dari git
git pull origin main

# Migrate DB kalau ada migration baru
docker run --rm --network wa-cs-platform_internal \
  -e DATABASE_URL="postgresql://hulao:$(cat secrets/postgres_password)@postgres:5432/hulao" \
  -v "$PWD:/app" -w /app node:20-bookworm-slim \
  npx prisma migrate deploy

# Build + restart
docker compose --env-file .env.production build nextjs wa-service
docker compose --env-file .env.production up -d --force-recreate nextjs wa-service

# Cek log
docker logs hulao-nextjs --tail 20
```

> ⚠️ **JANGAN PERNAH** pakai `prisma migrate dev` di production atau `prisma migrate diff --shadow-database-url $DATABASE_URL` (ini bisa wipe DB). Selalu pakai `migrate deploy` untuk production.

---

## 20. Troubleshooting Umum

### 20.1 User komplain "AI tidak balas pesan customer"

**Cek berurutan:**

1. Saldo token user — `/admin/users` → klik user → cek `balance`
2. Status WA session user — di /admin/users atau via DB:
   ```sql
   SELECT id, "phoneNumber", status FROM "WhatsappSession" WHERE "userId" = '<id>';
   ```
   - Status harus `CONNECTED`
   - `PAUSED` = saldo habis, perlu top-up
   - `DISCONNECTED` = perlu scan QR ulang
3. API key provider — `/admin/api-keys` → "Test All", semua harus hijau
4. Soul + Model di session — user harus set di /soul. Cek via DB:
   ```sql
   SELECT s.id, s."soulId", s."modelId", m.name FROM "WhatsappSession" s
   LEFT JOIN "AiModel" m ON m.id = s."modelId" WHERE s."userId" = '<id>';
   ```
5. Wa-service log — `docker logs hulao-wa-service --tail 100` cari error

### 20.2 User komplain "saya sudah transfer tapi token belum masuk"

1. Buka `/admin/finance` (untuk token) atau `/admin/subscriptions` tab Pending (untuk subscription)
2. Cari `invoiceNumber` user atau email-nya
3. Cek status — kalau `WAITING_CONFIRMATION` artinya bukti sudah masuk, tinggal kamu approve
4. Kalau `PENDING` artinya bukti belum di-upload — minta user upload via halaman billing

### 20.3 User tidak bisa login

1. Cek di DB apakah user exist:
   ```sql
   SELECT id, email, role, "emailVerified" FROM "User" WHERE email = '<user-email>';
   ```
2. Kalau `password` null → user daftar via Google OAuth, harus login pakai Google
3. Reset password via DB (lihat [§2.4](#24-reset-password-sendiri))
4. Cek log nextjs untuk error 500 di `/api/auth/*`

### 20.4 Disk penuh

Cek `/admin/dashboard` → Server Status. Kalau >85%:

1. Cleanup build cache: `docker builder prune -af` (recover 5-15 GB)
2. Cleanup orphan LP files: trigger cron `cleanup-lp` manual
3. Compress LP image lama: `docker exec hulao-nextjs node /app/scripts/compress-existing-lp-images.js`
4. Hapus backup lama: `find /var/backups/hulao -name '*.sql.gz' -mtime +30 -delete`
5. Cek top user storage di Server Status — kalau ada user abuse, hapus file mereka

### 20.5 LP user broken setelah update kode

Kalau ada perubahan di pipeline upload LP image (mis. nama folder berubah), file path lama bisa rusak. Cek:

```bash
# Compare LpImage.url di DB vs file di disk
docker exec hulao-nextjs ls /app/public/uploads/lp-images/<userId>/
```

Kalau ada file di disk tapi tidak di DB (atau sebaliknya), itu drift. Bersihkan via cron `cleanup-lp`.

### 20.6 WA session user disconnect terus

1. Cek session credentials di disk: `docker exec hulao-wa-service ls /app/sessions/`
2. Kalau folder kosong tapi DB punya record — credentials hilang, user harus scan QR ulang
3. Kalau folder ada tapi WA logout dari HP user, hapus folder + record DB:
   ```sql
   DELETE FROM "WhatsappSession" WHERE id = '<sessionId>';
   ```
   Lalu `docker exec hulao-wa-service rm -rf /app/sessions/<sessionId>`
4. User scan QR ulang via `/whatsapp` — credentials baru ke-create

### 20.7 Tripay webhook tidak masuk

1. Cek log nextjs untuk POST `/api/payment/tripay-webhook` atau `/api/subscription/tripay/callback`
2. Cek setting callback URL di Tripay merchant dashboard — harus point ke `https://hulao.id/api/payment/tripay-webhook` (token) dan `https://hulao.id/api/subscription/tripay/callback` (subscription)
3. Cek signature error di log: `[tripay-webhook] signature mismatch` — `TRIPAY_PRIVATE_KEY` di .env.production salah
4. Test manual via curl ke webhook (perlu signature valid — pakai Tripay sandbox simulator)

---

## 21. Glossary Istilah

| Istilah | Arti |
|---|---|
| **Token (platform)** | Mata uang virtual Hulao. 1 token = 1 pesan AI ke customer (default) |
| **costPerMessage** | Berapa token platform yg dipotong dari saldo user per balasan AI sukses |
| **Soul** | Kepribadian AI per WA session user — system prompt + personality + style |
| **Personality** | Karakter dasar AI (Sales/CS Pro/Ramah/Santai) — admin-curated |
| **Style** | Gaya balas (Closing/Singkat/Detail/Storytelling) — admin-curated |
| **Tier (LP)** | Level paket Landing Page: FREE/STARTER/POPULAR/POWER |
| **Subscription** | Langganan plan LP user (1/3/6/12 bulan), expire kalau tidak diperpanjang |
| **Invoice** | Tagihan per pembayaran subscription. Status PENDING → WAITING_CONFIRMATION → PAID |
| **Lifetime / Grandfathered** | Subscription user lama yg upgrade lewat sistem one-time legacy → endDate 2099 |
| **uniqueCode** | Kode 100-999 yg ditambah ke nominal manual transfer untuk identify pengirim |
| **Tripay** | Payment gateway IDR (VA bank, QRIS, e-wallet). Status auto via webhook |
| **PAUSED** | Status WA session saat saldo token habis — AI berhenti balas sampai user top-up |
| **Soul Lab** | Simulator 2 AI (penjual vs pembeli) untuk uji efektivitas Soul sebelum live |
| **LpVisit** | Tracking pengunjung public LP (per IP hashed) untuk throttle + cap bulanan |
| **Knowledge Base** | Database FAQ/testimoni user — disuntik ke system prompt saat keyword match |
| **Sales Flow** | Alur pertanyaan otomatis (COD/Transfer/Booking) — script-based, hemat token AI |

---

**Pertanyaan tidak ada di guide ini?** Cek source code: `/var/www/wa-cs-platform`. Atau hubungi developer.

**Last update**: 2026-05-07
