# API Publik Seller `/api/v1` — Fase 1 (baca saja)

Kunci API milik **seller** (beda dari `model ApiKey` = kunci provider AI milik **platform**).
Dibuat sendiri dari `/pengembang/api`, dipakai dari skrip / n8n / Zapier / Make.

## Kontrak inti

| Fungsi | File | Peran |
|---|---|---|
| `requirePublicApiAuth` | `lib/public-api-auth.ts` | SATU-SATUNYA gerbang `/api/v1/*`. Guard percobaan gagal per IP → verifikasi Bearer → rate limit per kunci → `touchApiKeyUsage`. Balikannya discriminated union `{ok:true,auth}` / `{ok:false,response}`. |
| `apiV1Ok` / `apiV1Error` | idem | Envelope `{success,data}` / `{success,error,code}` + header `X-RateLimit-*`. |
| `parsePagination` | idem | `?limit=1..100&cursor=<id>` seragam untuk semua endpoint list. Hanya memeriksa BENTUK — lihat "Cursor" di bawah. |
| `verifySellerApiKey` | `lib/services/seller-api-keys.ts` | Guard bentuk (prefix + panjang) → lookup by `keyHash` @unique → cek revoke/expiry. |
| `createSellerApiKey` | idem | Batas 5 kunci aktif ditegakkan di service (bukan hanya UI) di dalam transaksi + `pg_advisory_xact_lock` per user — tanpa lock, request paralel sama-sama membaca hitungan lama dan kuota tembus. `plainKey` hanya keluar sekali. |

**PENTING:** `middleware.ts` tidak mencakup `/api/**`. Tanpa `requirePublicApiAuth` di baris pertama
handler, endpoint v1 terbuka penuh. Jadikan ini butir checklist tiap menambah route v1.

## Model kunci

`SellerApiKey` (migrasi `20260822010000_seller_api_keys`):

- `keyHash` **SHA-256 satu arah** @unique — bocor DB tidak bisa dipakai memanggil API; lookup O(1).
  Tanpa salt: entropi 256-bit CSPRNG, dan salt memaksa scan tabel tiap request.
- Format kunci `hl_live_<base64url(32 byte)>` (51 char). `keyPrefix` 16 char + `lastFour` untuk masking.
- `revokedAt` = cabut **soft** (audit trail & `lastUsedAt` tetap ada). Kunci dicabut → 401 `key_revoked`.
- `scopes` default `["read"]`; Fase 2 (`write`) tidak perlu migrasi lagi — pakai `requireScope`.
- `lastUsedAt` di-throttle **2 lapis**: cache proses (5 menit) + guard `updateMany` di DB
  (`lastUsedAt < now-5m`) supaya multi-instance tidak saling menimpa. Bukan jam pemakaian presisi.

## Endpoint (semua GET, `dynamic = 'force-dynamic'`)

| Endpoint | Catatan |
|---|---|
| `/api/v1/ping` | Uji kredensial; menyebut `keyName` + `apiVersion`. |
| `/api/v1/contacts` | Filter `stage`/`tag`/`search`. Tanpa `notes`/`customFields`/`aiPaused`. |
| `/api/v1/contacts/{id}` | `findFirst({id, userId})` + `messageCount`. |
| `/api/v1/messages?contactId=` | `contactId` WAJIB. `Message` tak punya `userId` → filter `contact: { userId }`. |
| `/api/v1/messages/{externalMsgId}/status` | Status kirim + `creditChargedRp` (biaya user, bukan margin). |
| `/api/v1/balance` | Token AI + Kredit Pesan WA (Rp) + tarif per kategori template. |
| `/api/v1/senders` | `listSenderCandidates({userId})` — **JANGAN** `adminSessions:true` (bocor sesi platform). |

**Jangan diekspos:** `apiCostRp`/`revenueRp`/`profitRp`/`tokensCharged`, `notes`/`customFields`,
`wabaTokenEnc`/`wabaPinEnc`/`sessionData`. Pakai `select` eksplisit, jangan spread objek Prisma.

## Aturan respons

- **401** semua kegagalan auth. `malformed` & `not_found` dijawab **sama** (`invalid_token`) supaya
  penyerang tak bisa membedakan kunci yang eksis. `key_revoked` / `key_expired` boleh spesifik.
- **404** untuk resource bukan milik pemilik kunci — **bukan 403** (403 membocorkan bahwa id itu ada).
- **403** khusus scope kurang (Fase 2). **429** + `Retry-After`. **400** query invalid.
- **Haram `jsonOkCached`** di v1: helper itu menimpa `Vary` jadi `Accept-Encoding` supaya Cloudflare
  mau cache — di endpoint ber-Bearer artinya data user A bisa tersaji ke user B.

## Rate limit

Dua lapis dengan semantik berbeda:

- **Per kunci, 60/menit** — `consumeRateLimit` (`lib/rate-limit-memory.ts`, aditif; pasangan lama
  tak disentuh) menghitung SETIAP request. Saat kuota habis counter tidak dinaikkan lagi supaya
  penyerang tidak memperpanjang window klien jujur.
- **Per IP, 120 percobaan GAGAL/menit** — `checkRateLimit` + `recordRateLimitHit`, dicatat hanya
  saat auth gagal. Kalau request sah ikut dihitung, satu server dengan 3 kunci (3 × 60 = 180 req)
  akan kena 429 IP sebelum kuota per-kunci yang kita janjikan habis. Saat jatah gagal habis,
  request tetap diverifikasi dan **kunci sah tetap dilayani** — banyak seller berbagi satu IP
  publik (kantor/NAT/hosting); yang gagal dijawab 429 tanpa membocorkan alasan aslinya.
- **Plafon keras per IP, 600 request/menit** — menghitung SEMUA request dan menolak **sebelum**
  menyentuh DB. Tanpa ini, konsekuensi aturan di atas adalah penyerang bisa memaksa satu SHA-256 +
  satu SELECT per tebakan tanpa batas. Angkanya sengaja jauh di atas pemakaian wajar.

Header `X-RateLimit-*` hanya ada di respons yang lolos autentikasi (dan di 429 plafon keras);
respons 401 tidak membawanya karena kuota per-kunci belum bisa dihitung.

Keterbatasan (didokumentasikan juga di tab "Batas & Kuota"): in-memory per proses → reset saat
deploy, dan limit efektif × jumlah replika bila di-scale. Deployment sekarang single-instance;
pola DB-backed kalau perlu ada di `lib/otp/auth-otp.ts`.

## Route dashboard (auth sesi)

`GET/POST /api/pengembang/api-keys`, `DELETE /api/pengembang/api-keys/[id]`.
POST = satu-satunya tempat `plainKey` muncul — dilarang `console.log` body/respons di file itu.
Pembuatan dibatasi 15 percobaan/jam per user (yang gagal ikut dihitung, lewat `consumeRateLimit`).

## Webhook keluar (2026-08-25)

Endpoint webhook milik seller dikelola di `/pengembang/integrasi` (maks 5/user, kuota via
`pg_advisory_xact_lock`). Event: `message.received`, `message.status.updated`, `contact.created`,
plus `ping` (uji). Katalog & zod: `lib/validations/webhook-endpoint.ts`.

| Bagian | File | Catatan |
|---|---|---|
| Emisi | `lib/services/webhooks/dispatch.ts` | `emitWebhookEvent` fire-and-forget never-throw — dipanggil dari `message-store` (pesan masuk + kontak baru), `waba/statuses` (status Cloud), `internal/messages/status` (ack Baileys). Percobaan pertama langsung. |
| Kirim | `lib/services/webhooks/deliver.ts` | Klaim EKSKLUSIF via `claimedAt` (dua run cron tak sama-sama mengirim; guard basi 2 mnt) → HMAC (`X-Hulao-Signature: t=...,v1=...` atas `${t}.${body}`) → POST via `https.request` dengan `lookup` ter-guard (anti DNS-rebinding), timeout 10 dtk, redirect TIDAK diikuti, respons >1KB resolve segera (bukan menunggu `end` — hindari hang). Throttle 120 kirim/mnt per endpoint (breaker volume). Retry ±1m/5m/30m/2j/8j (maks 6) → DEAD; 50 gagal beruntun → endpoint auto-nonaktif + sisa delivery-nya DEAD. |
| Guard SSRF | `lib/services/webhooks/url-guard.ts` | https-only; v4 tolak privat/loopback/link-local/CGNAT/metadata/TEST-NET/multicast/reserved; v6 **default-deny** (hanya 2000::/3 global, minus 6to4/Teredo/doc) + decode IPv4-mapped dotted&hex + strip bracket literal; validasi saat create DAN via `lookup` tiap koneksi. PATCH url dibatasi 30/jam (anti oracle DNS). Dev: `WEBHOOK_ALLOW_PRIVATE_URL=1` (JANGAN di prod/staging). |
| Secret | `lib/services/webhooks/endpoints.ts` | `whsec_<base64url 24B>`, disimpan AES-256-GCM (`lib/crypto.ts`) karena harus dibaca balik untuk menandatangani; plaintext hanya keluar saat create/rotate. |
| Cron | `app/api/cron/webhook-retry` | Tiap 5 menit: retry FAILED jatuh tempo (paralel) + selamatkan PENDING macet >2 mnt + purge >30 hari. TERDAFTAR staging 2026-08-25 via crontab server (helper `hulao-staging-cron-call.sh`); saat rilis produksi tambahkan baris serupa ke helper produksi. |

Dokumentasi user (verifikasi tanda tangan, anti-replay, dedup by event id): tab **Webhooks** di
`/pengembang/api`.

> **Catatan infra (di luar kode)**: guard SSRF tidak memblokir IP PUBLIK server sendiri. Pastikan
> `wa-service` (port 3001) & endpoint `internal/*` hanya reachable dari localhost/jaringan container
> (firewall / bind 127.0.0.1), bukan hanya dilindungi secret app-layer.

## Fase berikutnya (belum ada)

`POST /api/v1/messages` membungkus `smartSend` (sudah never-throw & sadar window/compliance).
