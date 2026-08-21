# WABA Trek 2B — Template Meta, Kredit Pesan, Broadcast/Follow-up/OTP Cloud API

Dua jalur WA permanen: **Baileys** (unofficial, free-text) + **Cloud API** (resmi Meta).
Aturan Meta untuk sesi Cloud API: pesan business-initiated di luar window 24 jam
wajib **template ter-approve** dan **berbayar per pesan** → dompet **Kredit Pesan WA** (Rp).

## Kontrak inti (satu pintu)

| Fungsi | File | Peran |
|---|---|---|
| `assertCanSendCloud` | `lib/services/waba/compliance.ts` | SATU sumber aturan kirim cloud: window, blacklist (template saja), status template, opt-out marketing, saldo kredit. Sesi milik ADMIN → `creditUserId=null` (platform tidak ditagih). |
| `sendCloudTemplate` | `lib/services/waba/send-template.ts` | SATU-satunya jalur kirim template. Never-throw. Assert → Graph → simpan `Message` (+ jejak billing) → `chargeMessageCredit` (reference = wamid, idempoten). |
| `smartSend` | `lib/services/wa-send/smart-send.ts` | SEMUA jalur non-CS (OTP, follow-up, notif, handoff, LMS). Loop kandidat: Baileys → Cloud dalam window (teks, gratis) → Cloud template (`templateId`/`purposeKey`). |
| `listSenderCandidates` | `lib/wa-session.ts` | Kandidat sesi CONNECTED urut: explicit → preferred → sesi kontak → Baileys → Cloud. Jangan lagi `findFirst({status:'CONNECTED'})` buta provider. |

## Kredit Pesan (dompet kedua, Rupiah)

- Kolom `TokenBalance.messageCreditRp/Purchased/Used`; ledger `MessageCreditTransaction`
  unique `(userId, reference, type)` — idempoten by wamid.
- Harga per kategori di `MessageCreditRate` (admin: `/admin/message-credits`). Sesuai dokumen
  pricing owner (2026-08-21): **Marketing Rp657 · Utility Rp393 · Authentication Rp393** per pesan
  (dasar Meta ID: Rp586,33 / Rp356,65 / Rp356,65 — markup ±10–12%). Free Entry Point (CTWA 72 jam)
  & pesan dalam window gratis — Meta tidak menagih → rekonsiliasi merefund otomatis.
- Alur: pre-flight (assert) → **deduct saat wamid diterima** (tanpa guard gte — minus maks ±1
  pesan per race) → webhook `statuses[].pricing` merekonsiliasi (refund/adjust) →
  `failed` → refund penuh. UTILITY dalam window = gratis (expected 0).
- Top-up: paket `TokenPackage.kind = MESSAGE_CREDIT` → `Payment/ManualPayment.purpose =
  MESSAGE_CREDIT_PURCHASE` → `lib/billing/apply-payment-credit.ts` (semua jalur kredit:
  Tripay webhook, polling status, cron reconcile, konfirmasi manual, bonus admin).

## Template (`WabaTemplate`)

- Status ikut Meta (webhook App-level + polling sync di cron `waba-token-refresh`).
- Sync = UPSERT by `(wabaId, name, language)` + paging; hilang dari Meta → soft `DELETED`.
- AUTH template dikirim dengan body param = kode DAN `sub_type:'url'` index '0' text = kode.
- Starter pack (`lib/services/waba/starter-pack.ts`): 11 template follow-up `hulao_*` +
  `PLATFORM_TEMPLATES` (`hulao_otp` AUTH, `hulao_platform_info` UTILITY).
  `ensureTemplatesByPurpose` idempoten; `autoLinkStarterFollowUps` mengisi
  `FollowUpTemplate.metaTemplateId/metaParamMap` untuk default yang cocok.
- UI: `/whatsapp/templates`; inbox `send` 409 `WINDOW_CLOSED` → `SendTemplateDialog`.

## Broadcast Cloud API

- `lib/services/broadcast/start.ts` (satu pintu route `/send` + cron) →
  `BroadcastRecipient` per penerima → `cloud-runner.ts` batch (claim atomik,
  PAUSED saat kredit habis/template dijeda, SKIPPED opt-out/blacklist, retry rate limit).
- Worker = cron `broadcast-send` **tiap 1 menit** (juga men-start SCHEDULED kedua provider).
- Counter delivered/read/failed dari webhook `statuses` (`recipient-status.ts`).

## Cron (cron-job.org, `?secret=CRON_SECRET`)

- `followup-send` /5 menit · `waba-token-refresh` /1 jam · **`broadcast-send` /1 menit (BARU)**.

## Prasyarat dashboard Meta

- Webhook fields: messages, smb_message_echoes, history, smb_app_state_sync, account_update,
  message_template_status_update, message_template_quality_update, template_category_update,
  user_preferences. (Template/account webhooks selalu ke callback level-App.)
- Metode pembayaran aktif di WhatsApp Manager > Billing per WABA (tanpa itu 131042).
