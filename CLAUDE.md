# WA CS Platform — Claude Code Briefing

## Tentang Proyek
Platform SaaS untuk WhatsApp AI Customer Service + CRM.
User daftar, beli token, hubungkan WA via QR scan, set "soul" (kepribadian AI),
dan WA mereka otomatis balas pesan dengan AI.

## Tech Stack
- **Frontend + API**: Next.js 14 (App Router), TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js (email/password + Google OAuth)
- **WA Engine**: Baileys (service terpisah di /wa-service)
- **AI**: Anthropic Claude API (multi-model support)
- **Payment**: Midtrans
- **Realtime**: Socket.io
- **Validasi**: Zod + React Hook Form

## Struktur Folder
```
wa-cs-platform/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Route group: login, register
│   ├── (dashboard)/            # Route group: semua halaman user
│   │   ├── dashboard/          # Halaman utama dashboard
│   │   ├── whatsapp/           # Manage WA connections
│   │   ├── soul/               # Soul configuration per WA
│   │   ├── inbox/              # CRM inbox terpusat
│   │   ├── contacts/           # CRM contact management
│   │   ├── broadcast/          # Kirim pesan massal
│   │   ├── analytics/          # Statistik & laporan
│   │   └── billing/            # Token & pembayaran
│   ├── (admin)/                # Route group: admin panel
│   │   ├── users/              # Manage users
│   │   ├── models/             # Manage AI models
│   │   ├── pricing/            # Manage harga token
│   │   └── analytics/          # Platform analytics
│   ├── api/                    # API Routes
│   │   ├── auth/               # NextAuth endpoints
│   │   ├── whatsapp/           # WA connect, status, disconnect
│   │   ├── soul/               # CRUD soul config
│   │   ├── tokens/             # Token balance, topup
│   │   ├── contacts/           # CRM contacts
│   │   ├── messages/           # Message history
│   │   ├── broadcast/          # Broadcast management
│   │   ├── webhook/            # Midtrans payment callback
│   │   └── admin/              # Admin-only endpoints
│   └── layout.tsx
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── dashboard/              # Dashboard-specific components
│   ├── whatsapp/               # WA connection components
│   ├── soul/                   # Soul builder components
│   ├── crm/                    # CRM components
│   └── shared/                 # Shared components
├── lib/
│   ├── prisma.ts               # Prisma client singleton
│   ├── auth.ts                 # NextAuth config
│   ├── anthropic.ts            # Claude API client
│   ├── midtrans.ts             # Midtrans client
│   ├── socket.ts               # Socket.io client
│   ├── token.ts                # Token calculation logic
│   └── utils.ts                # Helper functions
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed data
├── wa-service/                 # WA Engine (Node.js terpisah)
│   ├── src/
│   │   ├── index.ts            # Entry point, Socket.io server
│   │   ├── wa-manager.ts       # Manage multiple WA sessions
│   │   ├── ai-handler.ts       # Process pesan → Claude API → reply
│   │   ├── token-checker.ts    # Cek & potong token sebelum reply
│   │   └── session-store.ts    # Simpan/load Baileys credentials
│   └── package.json
├── hooks/                      # Custom React hooks
├── types/                      # TypeScript type definitions
├── middleware.ts               # Auth middleware (protect routes)
└── .env.local                  # Environment variables
```

## Database Schema (ringkasan)
- **User**: id, email, password, name, role (USER/ADMIN), createdAt
- **TokenBalance**: userId, balance, totalPurchased, totalUsed
- **TokenTransaction**: userId, amount, type (PURCHASE/USAGE), description, createdAt
- **WhatsappSession**: id, userId, phoneNumber, displayName, status, soulId, modelId, createdAt
- **Soul**: id, userId, name, systemPrompt, personality, businessContext, language, replyStyle
- **AiModel**: id, name, provider, modelId, costPerMessage, isActive (diset admin)
- **Contact**: id, userId, waSessionId, phoneNumber, name, tags, pipelineStage, notes
- **Message**: id, contactId, waSessionId, content, role (AI/HUMAN/USER), createdAt
- **Broadcast**: id, userId, waSessionId, message, targetTags, status, scheduledAt

## CS Live AI — Dual Mode HostTemplate (2026-06-02)

HostTemplate.mode menentukan cara host bicara saat live:

**TTS_GENERATIVE (default, legacy)** — 1 video loop silent + scenes per kategori.
Customer chat → Claude generate text → OpenAI TTS realtime → audio queue di client.
Pros: jawab apa saja. Cons: TTS latency 2-5dtk, suara robot.

**NATIVE_LIBRARY (Klip Live, 2026-06-02)** — library MP4 dengan audio bonded.
Customer chat → embed question (text-embedding-3-small) → cosine match vs LiveClip → klip menang play.
Pipeline klip:
1. Owner ketik script per kategori (GREETING/PRICE/PRODUCT_DEMO/dll)
2. Backend: ElevenLabs TTS → audio MP3
3. Adaptive Kling motion prompt (dari `host-gen/vision-analyzer.ts` analisis sourceImage)
4. Kling lip-sync endpoint (`/v1/videos/lip-sync`) audio2video → MP4 dengan lip-sync presisi
5. OpenAI embed transcript → simpan ke LiveClip.embedding
Pros: suara natural, lip-sync presisi, no realtime TTS latency. Cons: jawaban terbatas library.

**Mode selection**: `/host-templates` → "Bikin Host Baru" → modal mode picker.
Wizard sama persis untuk dua mode, cuma flag mode beda di create payload.

**Pre-req per mode:**
- TTS: HostTemplate.videoLoopUrl harus ada (generate via Kling image2video).
- Klip Live: minimal 1 klip kategori IDLE atau isDefaultIdle=true untuk loop sepi.

**Live integration** (`/api/live/[slug]/chat/route.ts`):
- room.hostTemplate.mode === 'NATIVE_LIBRARY' → matchClip → return `{mode:'clip', clip:{...}}`
- Else: existing TTS flow → `{mode:'tts', reply, sentences}`
- Client `LiveRoomView` branch berdasarkan response.mode:
  - clip: swap video src ke clip.videoUrl, audio inline, transcript di chat overlay
  - tts: existing scene swap + audio queue

**Provider keys needed:**
- ANTHROPIC (vision analyzer + clip suggester + chat)
- OPENAI (Whisper admin upload, embedding, TTS legacy mode)
- KLING (image2video + lip-sync endpoint)
- ELEVENLABS (TTS untuk Klip Live audio gen)

**Foundation tables (Sprint 1):**
- HostMode enum, LiveClip, LiveClipUsage, BackgroundPreset, VisualHookPreset
- Migration: `20260602001138_klip_live_foundation`
- Seed: `prisma/seeds/backgrounds-and-hooks.ts` (25 backgrounds + 50 hooks)

## Konvensi Kode
- Semua kode TypeScript strict mode
- Komentar dalam Bahasa Indonesia
- API response selalu: `{ success: boolean, data?: any, error?: string }`
- Error handling wajib di semua API routes dengan try/catch
- Validasi input pakai Zod schema
- Database query selalu lewat Prisma (tidak ada raw SQL kecuali terpaksa)
- Komponen UI pakai shadcn/ui dulu sebelum custom

## Environment Variables yang Dibutuhkan
```
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ANTHROPIC_API_KEY=
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
WA_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_WA_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

## Penting — Cara Kerja Token Platform
- 1 "token platform" = 1 pesan WA yang dibalas AI
- Admin set berapa token dipotong per model (contoh: Haiku = 1 token, Sonnet = 3 token)
- User beli paket token (10K, 50K, 200K)
- Setiap AI reply → potong token dari balance user
- Kalau token habis → WA auto-pause, user dapat notif

## Cara Kerja WA Service
- wa-service jalan sebagai proses terpisah di port 3001
- Komunikasi: Next.js API → HTTP request ke wa-service
- Realtime update (QR code, status) → Socket.io dari wa-service ke frontend
- Setiap WA session = 1 instance Baileys
- Credentials disimpan di database agar reconnect otomatis

## Perintah Penting
```bash
# Development
npm run dev                    # Jalankan Next.js (port 3000)
cd wa-service && npm run dev   # Jalankan WA service (port 3001)

# Database
npx prisma migrate dev         # Buat migration baru
npx prisma studio              # GUI untuk lihat database
npx prisma db seed             # Seed data awal

# Build
npm run build
npm run start
```
