# PLAN — AI Concierge (a.k.a. "Hulao Concierge")

**Status:** Draft, belum eksekusi
**Inspirasi:** Siska AI (event Kelas Produsen 2026-05-22)
**Tanggal rencana:** 2026-05-22

---

## Visi

Tiap user Hulao bisa attach AI assistant ber-suara + ber-wajah ke CTA landing page mereka. Konsumen klik CTA → masuk ke halaman AI assistant yang bisa bicara, mendengar, melihat (kamera), dengan knowledge + soul user, akses produk + ongkir + flash sale Hulao, dan menyimpan WA konsumen ke followup engine existing.

## Decisions (final, dari user 2026-05-22)

| Decision | Pilihan |
|---|---|
| Embed mode CTA | **Dua-duanya** — full-page `/concierge/[slug]` + popup overlay dalam LP |
| MVP scope | **Full Siska clone** — voice + kamera + face-recognition dari awal |
| Billing | **Per message/turn** — tiap turn = 1 transaksi `executeAiWithCharge` |
| Templates admin | **3 preset** — Sales, Customer Service, Konsultan |

## Estimasi timeline (5 minggu)

| Week | Deliverable |
|---|---|
| 1 | Prisma schema, admin template CRUD, user assistant CRUD, lead-gate, WaContact wiring |
| 2 | Text chat dgn Soul+Knowledge, transcript view + download CSV/PDF |
| 3 | TTS + avatar video 5-state + handsfree mic + Whisper STT |
| 4 | Face recognition returning visitor + sidebar produk dinamis + tool ongkir + flash sale awareness |
| 5 | Pixel events + OrderForm bridge + popup overlay mode + per-turn billing + rate limit + analytics minimal |

---

## Arsitektur tinggi

```
[Landing Page user Hulao /p/[slug]]
    │  CTA "Tanya AI" / "Konsultasi"
    ▼  (full-page atau popup overlay)
[Lead Gate: form Nama + WA]  ←── wajib sebelum chat, opt-in micro-consent
    │  WA → upsert WaContact (source: AI_ASSISTANT, tag: ai-{slug})
    │  → trigger followup rule existing
    ▼
[Chat Room AI Assistant /concierge/[slug]]
    ├── Avatar video 5-state (idle/listen/think/talk/greet)
    ├── Mic handsfree (VAD) atau push-to-talk
    ├── Camera optional (face-rec untuk returning visitor)
    ├── Chat bubble + TTS streaming
    ├── Sidebar dinamis: produk, gambar testimoni, ongkir result
    └── Quick action: "Pesan Sekarang" → OrderForm existing

[Dashboard user Hulao]
    ├── Buat & edit AI Assistant (pilih template admin)
    ├── List transkrip per lead + download
    ├── Lead manager (auto-link ke Followup)
    └── Analytics minimal

[Admin Hulao]
    └── Template Siska (preset soul + behavior + greeting)
```

---

## Data model baru (Prisma)

### `AiAssistant`
Per user, multi-instance. Tiap LP CTA bisa point ke instance berbeda.

```
id           String   @id @default(cuid())
userId       String
slug         String   @unique  // /concierge/[slug]
name         String              // "Siska", "Maya", dll
displayName  String
soulPersonalityId   String?      // FK SoulPersonality existing
knowledgeBaseId     String?      // FK Knowledge existing
templateId          String?      // FK AiAssistantTemplate

voice               String   @default("nova")
avatarSet           Json     // { idle, listen, think, talk, greet, idle2? }
greetingPhrases     Json     // [string]

features            Json     // { shipping, flashSale, orderForm, camera, handsfree }
leadCaptureFields   Json     // ['name','phone'] default
productSourceMode   String   @default("all")  // 'all' | 'manual'
productIds          Json     // string[]
theme               Json     // { primaryColor, logoUrl, ... }

embedMode           String   @default("both")  // 'fullpage' | 'popup' | 'both'
maxMessagesPerSession  Int   @default(50)
maxSessionsPerDay      Int   @default(200)  // anti-abuse

isPublished         Boolean  @default(false)
publishedAt         DateTime?
createdAt, updatedAt

@@index([userId])
@@index([slug])
```

### `AiAssistantSession`
1 percakapan dari 1 konsumen.

```
id            String   @id @default(cuid())
assistantId   String
leadName      String
leadPhone     String   // E.164-ish, normalized
leadEmail     String?
leadCity      String?
waContactId   String?  // FK WaContact existing (post-upsert)

faceDescriptor      Json?    // 128 float, untuk returning visitor recog
startedAt           DateTime @default(now())
endedAt             DateTime?
outcome             String   @default("open")  // open | converted | abandoned

messagesCount       Int      @default(0)
totalCostTokens     Int      @default(0)

lpSource            String?  // slug LP asal
referrer            String?
userAgent           String?

pixelEvents         Json     // [{ type, ts, payload }]

@@index([assistantId, startedAt])
@@index([leadPhone])
```

### `AiAssistantMessage`
Per turn (1 user msg + 1 AI reply = 2 rows).

```
id            String   @id @default(cuid())
sessionId     String
role          String   // user | assistant
content       String   @db.Text
audioUrl      String?  // optional, simpan kalau user setuju recording

# Billing fields — per-turn
costTokens          Int      @default(0)    // total billed
costBreakdown       Json     // { stt, llm, tts } satuan tokens

# UI actions emit oleh AI
uiActions           Json     // [{ type: 'show_product', payload }]

createdAt           DateTime @default(now())

@@index([sessionId, createdAt])
```

### `AiAssistantTemplate`
Admin-only.

```
id              String   @id @default(cuid())
name            String   // "Sales", "Customer Service", "Konsultan"
description     String   @db.Text
slug            String   @unique
defaultSoulId   String?
promptDelta     String   @db.Text   // tambahan ke base prompt
defaultGreetings Json    // string[]
recommendedFeatures Json
isPublic        Boolean  @default(true)
createdAt, updatedAt
```

Tidak menambah tabel WaContact baru. Lead langsung di-upsert ke `WaContact` existing dengan `source: 'AI_ASSISTANT'`, tag `ai-{assistantSlug}`. Followup engine pick up otomatis.

---

## Integrasi ke fitur Hulao existing

| Fitur Hulao | Cara di-reuse |
|---|---|
| **Soul Personality** | `assistant.soulPersonalityId` → systemPrompt builder, pattern sama dengan CS AI |
| **Knowledge Base** | Inject ke prompt (anchor, image, file). **TENANT_SCOPE hard rule wajib** — anti cross-brand leak (incident BlessGold→Cleanoz 2026-05-12) |
| **RajaOngkir Shipping** | Tool call: AI → `calculateShipping(destCity, productId)`. Pakai `UserShippingProfile.originCityId` + `CsAiIntegration.shippingCalcEnabled` |
| **Produk + Flash Sale** | Tool `getProduct`, `getActiveFlashSales` |
| **OrderForm** | AI emit `[SHOW_ORDER_FORM:productId]` → frontend bridge ke OrderForm existing |
| **Followup** | `WaContact` upsert → event `AI_ASSISTANT_LEAD_CAPTURED` → followup rule trigger (POWER tier) |
| **Pixel Tracking** | Event: `ai_chat_started`, `lead_captured`, `product_viewed`, `add_to_cart` → forward Meta/TikTok via LP Pixel Injector existing |
| **executeAiWithCharge** | Wrapper wajib di tiap call STT/LLM/TTS — **UUID-suffix idempotency** (anti regresi tabrakan, incident akmn22 2026-05-11) |
| **Anti-escalate + tenant-scope** | Inherit dari CS AI: tidak janji panggil admin, tidak leak brand lain |

---

## Flow konsumen detail

1. **Klik CTA** di `/p/[lpSlug]` → redirect `/concierge/[assistantSlug]?lp={lpSlug}` (full-page) atau buka modal (popup mode)
2. **Lead Gate** (full-screen / modal step 1):
   - Nama (text), WA (validasi format ID), consent micro-text
   - Submit → upsert WaContact + create AiAssistantSession
   - Returning lead: skip greet awal, langsung "Selamat datang kembali, [Nama]"
3. **Chat Room**:
   - Greeting auto-play (TTS) sambil avatar greeting state
   - Mic toggle: handsfree (VAD) atau push-to-talk
   - Camera toggle: face-rec untuk recognize returning visitor (descriptor stored per-assistant, bukan global)
   - Sidebar produk default tampil 3 produk top, expand jadi grid kalau user tanya
4. **AI behavior**:
   - Tertarik produk → tampilkan kartu produk + harga + flash sale badge kalau ada
   - Tanya ongkir → AI minta kota → call shipping tool → tabel ongkir di sidebar
   - Ready beli → tombol "Pesan Sekarang" appear → redirect ke OrderForm existing
5. **End session**: tombol "Selesai" atau idle > X menit → mark `endedAt`

---

## Flow user Hulao (pemilik LP)

| Tab dashboard | Isi |
|---|---|
| **Buat Assistant** | Wizard: nama, pilih template admin, pilih soul, knowledge, produk, fitur. Preview avatar real-time |
| **Embed** | Generate URL `/concierge/[slug]` + snippet CTA. Pilih full-page atau popup |
| **Lead inbox** | List session: nama, WA, tanggal, ringkasan AI (summary auto-generated), status follow-up. Klik → detail transkrip |
| **Transcript** | Full chat, audio replay (opt), download CSV/PDF, "Kirim ke followup manual" |
| **Analytics** | Total session, conversion ke order, top produk yang disinggung, drop-off point |

## Flow admin Hulao

- `/admin/ai-templates` → CRUD template "preset Siska"
- 3 preset default: **Sales** (pushy ramah), **Customer Service** (informatif), **Konsultan** (edukatif)
- User saat create assistant → wajib pilih template → boleh customize

---

## Stack teknis

| Komponen | Pilihan | Catatan |
|---|---|---|
| STT (mic → teks) | **OpenAI Whisper API** | Akurat support Bahasa Indo. Browser SpeechRecognition kurang akurat untuk dialek |
| LLM | **Claude Haiku 4.5** untuk percakapan basic, **Sonnet 4.6** untuk reasoning (shipping calc, dll) | Tetap di Anthropic SDK existing |
| TTS | **OpenAI gpt-4o-mini-tts** (voice nova) | Sudah dipakai Siska, terbukti hangat |
| Face Recognition | **face-api.js** client-side (@vladmandic/face-api 1.7.13) | Gratis, 7MB model, browser-cached |
| Avatar Video | 5-state MP4 (idle/listen/think/talk/greet) | Pattern Siska. Bisa upload custom per assistant |
| Streaming | **SSE** seperti Siska chat.js | Stream chunk text, TTS streaming chunk |
| Audio capture | MediaRecorder + WebAudio VAD untuk handsfree | Standard browser API |
| Mobile | Mobile-first responsive | 70-80% konsumen mobile |

---

## Billing per message/turn

Tiap turn AI = 1 transaksi `executeAiWithCharge` dengan UUID-suffix reference. Cost components:

- **STT**: per detik audio (Whisper $0.006/min ≈ Rp10/detik)
- **LLM**: per token (Haiku $0.80/MTok input, $4/MTok output)
- **TTS**: per char (gpt-4o-mini-tts $0.015/1k chars)

Bundle ke 1 record `AiAssistantMessage.costBreakdown = { stt, llm, tts }`, total ke `costTokens`. Margin pakai skema **Fair-Pricing Unification** existing (margin 2.0, floor 10, no cap).

**Rate limit**: `maxMessagesPerSession` (default 50), `maxSessionsPerDay` per assistant (default 200). Configurable per paket Hulao.

---

## Risiko & catatan penting

- **Multi-tenant safety**: hard rule TENANT_SCOPE di prompt — wajib mention nama brand + scope produk di sistem prompt. Incident BlessGold→Cleanoz tidak boleh terulang
- **Privacy lead**: micro-consent di lead gate, GDPR-style ringan ("WA Anda disimpan untuk komunikasi lanjutan dari [user brand]")
- **Cost runaway**: tanpa rate limit, 1 bot abuse bisa habiskan banyak token. Hard cap per session + per assistant per hari
- **Voice latency**: Whisper round-trip + LLM + TTS bisa 4-6s. **Streaming TTS wajib** (chunk per kalimat) biar tidak terasa lemot
- **STT Bahasa Indonesia**: Whisper kurang akurat untuk aksen daerah. Fallback ke text input selalu tersedia
- **Mobile UX**: layout mobile-first non-negotiable. Avatar bisa di header (compact mode mobile)
- **face-api.js bandwidth**: 7MB model + bandwidth descriptor sync. Lazy-load saat kamera diaktifkan
- **Idempotency**: tiap message reference = UUID per turn, anti tabrakan dengan pattern executeAiWithCharge

---

## Setup eksternal yang akan dibutuhkan (saat live)

- Anthropic API key (sudah ada)
- OpenAI API key untuk Whisper STT + TTS (perlu cek apakah sudah ada untuk Siska di Hulao infrastructure, atau bikin baru)
- Cron baru? Tidak ada cron baru — semua event-driven
- Storage face descriptor: Postgres JSONB (sudah cukup, ~512B per descriptor)
- Storage audio (opsional): kalau mau simpan audio replay, perlu S3-like atau folder uploads/

---

## Phase 1 minggu pertama — concrete deliverables (saat eksekusi mulai)

1. Prisma migration: 4 tabel baru
2. Admin: `/admin/ai-templates` CRUD (3 preset seeded)
3. User dashboard: `/dashboard/ai-assistant` list + create wizard step 1 (basic info + template pick)
4. Lead gate page `/concierge/[slug]` step 1 only (form + create session, tanpa chat)
5. WaContact upsert + tag wiring + followup event emit
6. Unit test: schema integrity, lead capture happy path

---

## Open questions untuk eksekusi nanti

- Apakah audio recording per session disimpan default? (privacy + storage cost)
- Returning visitor face-rec scope: per assistant atau per user (cross-assistant)?
- Konsumen yang sama bisa lompat antar assistant user lain? (cross-tenant ID = tidak, terlalu privacy-sensitive)
- Quota free trial untuk user baru? (mis. 100 message gratis untuk testing)
- Apakah perlu transcript auto-summary AI? (1 paragraf ringkasan per session, dipakai di Lead inbox)

---

**Next step:** menunggu user trigger eksekusi. Saat mulai, baca dokumen ini + memory `project_hulao_concierge_plan` sebagai source of truth.
