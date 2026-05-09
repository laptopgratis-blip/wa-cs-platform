// LP Chat Signal extractor — kategorisasi pesan customer (dari WA chat) yg
// terkait dengan LP tertentu, supaya bisa identify customer concerns &
// jadi konteks untuk AI optimization Phase 4.
//
// Matching strategy LP ↔ chat:
//   1. UserOrder yg punya orderFormId → kalau OrderForm dipakai promosi LP
//      (manual link dari user, kita tidak track 1:1 di schema). Skip kalau
//      ambigu — pakai approach 2.
//   2. UTM utm_source = "lp_<slug>" di UserOrder → traceable. Tapi kebanyakan
//      LP tidak set UTM ini di tombol CTA-nya yg ke wa.me, jadi miss.
//   3. Phase 3 fallback (yang dipakai sekarang): scan SEMUA Message dari
//      Contact milik user owner LP, dari N hari terakhir. Tidak per-LP
//      precise tapi cukup untuk capture overall customer concerns user.
//      Per-LP precision di-improve nanti dengan UTM injection di tracker JS.
//
// Kategorisasi: keyword bucket (case-insensitive substring match). Hemat
// token (no AI call). Trade-off: miss nuance, tapi cukup untuk surface
// frequent concerns.
import { prisma } from '@/lib/prisma'

export type SignalCategory =
  | 'harga_mahal'
  | 'gak_paham'
  | 'gak_percaya'
  | 'ragu_kualitas'
  | 'gak_yakin'
  | 'cocok_kebutuhan'

export const SIGNAL_LABELS: Record<SignalCategory, string> = {
  harga_mahal: 'Harga dianggap mahal',
  gak_paham: 'Tidak paham produk',
  gak_percaya: 'Tidak percaya / takut scam',
  ragu_kualitas: 'Ragu kualitas / awet',
  gak_yakin: 'Belum yakin / mikir-mikir',
  cocok_kebutuhan: 'Tanya kecocokan kebutuhan',
}

// Keyword set per kategori. Kata-kata Indonesia umum + variasi typo ringan.
// Order matter — first match wins (kalau pesan match >1 kategori).
const KEYWORDS: Array<{ category: SignalCategory; words: string[] }> = [
  {
    category: 'harga_mahal',
    words: [
      'mahal', 'kemahalan', 'mahal banget', 'lebih murah', 'diskon ga',
      'diskon dong', 'potong harga', 'kasi murah', 'kasih murah', 'overprice',
      'kemahalan ya', 'gak ada diskon', 'gak ada promo',
    ],
  },
  {
    category: 'gak_paham',
    words: [
      'gimana cara', 'maksudnya gimana', 'bisa dijelasin', 'belum paham',
      'gak ngerti', 'ga ngerti', 'masih bingung', 'kurang paham',
      'ga ada yg jelasin', 'apaan sih', 'gimana kerjanya',
    ],
  },
  {
    category: 'gak_percaya',
    words: [
      'asli ga', 'asli kah', 'scam', 'penipuan', 'real ga', 'beneran ga',
      'amankah', 'aman ga', 'garansi', 'penipu', 'ga percaya',
      'takut kena tipu', 'jangan-jangan',
    ],
  },
  {
    category: 'ragu_kualitas',
    words: [
      'kualitasnya gimana', 'awet ga', 'tahan berapa lama', 'cepet rusak',
      'gampang rusak', 'kualitas jelek', 'kualitasnya bagus ga',
      'mutu', 'reject', 'cacat',
    ],
  },
  {
    category: 'gak_yakin',
    words: [
      'mikir-mikir dulu', 'mikir dulu', 'nanti aja', 'tanya suami',
      'tanya istri', 'mau diskusi', 'belum siap', 'tunggu gajian',
      'belum ada uang', 'pikir-pikir',
    ],
  },
  {
    category: 'cocok_kebutuhan',
    words: [
      'cocok untuk', 'cocok buat', 'bisa untuk', 'bisa buat saya',
      'kalau saya', 'kalo punya', 'untuk pemula', 'untuk usia',
      'efektif buat', 'cocok ga',
    ],
  },
]

// Cap supaya tidak terlalu mahal di-process: max N pesan per LP per cron run.
const MAX_MESSAGES_PER_RUN = 5000

interface ExtractResult {
  lpId: string
  totalMessagesScanned: number
  signalsByCategory: Map<SignalCategory, { count: number; samples: string[] }>
}

export async function extractSignalsForLp(
  lpId: string,
  periodDays: number = 30,
): Promise<ExtractResult> {
  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { userId: true, slug: true },
  })
  if (!lp) {
    return {
      lpId,
      totalMessagesScanned: 0,
      signalsByCategory: new Map(),
    }
  }

  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)

  // Scan customer messages dari user owner LP.
  // Filter: role customer (bukan AI/admin reply), createdAt dalam periode.
  // Schema Message: ada field 'role' (USER | ASSISTANT | dst) — pakai USER.
  const messages = await prisma.message.findMany({
    where: {
      contact: { userId: lp.userId },
      role: 'USER',
      createdAt: { gte: since },
      // Skip pesan kosong/sangat pendek (greeting, sticker reaction).
      content: { not: '' },
    },
    select: { content: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_MESSAGES_PER_RUN,
  })

  const signalsByCategory = new Map<
    SignalCategory,
    { count: number; samples: string[] }
  >()
  for (const cat of Object.keys(SIGNAL_LABELS) as SignalCategory[]) {
    signalsByCategory.set(cat, { count: 0, samples: [] })
  }

  for (const msg of messages) {
    const text = msg.content.toLowerCase().trim()
    if (text.length < 4) continue
    for (const { category, words } of KEYWORDS) {
      const hit = words.some((w) => text.includes(w.toLowerCase()))
      if (hit) {
        const bucket = signalsByCategory.get(category)!
        bucket.count++
        // Keep up to 3 sample quotes per category (anonymized snippet).
        if (bucket.samples.length < 3) {
          const snippet = msg.content.slice(0, 80).replace(/\s+/g, ' ').trim()
          if (snippet && !bucket.samples.includes(snippet)) {
            bucket.samples.push(snippet)
          }
        }
        break // first-match wins per pesan
      }
    }
  }

  return {
    lpId,
    totalMessagesScanned: messages.length,
    signalsByCategory,
  }
}

// Persist hasil ke LpChatSignal table — upsert per (lpId, category, periodDays).
export async function persistSignals(
  result: ExtractResult,
  periodDays: number,
): Promise<void> {
  const ops = Array.from(result.signalsByCategory.entries()).map(
    ([category, data]) =>
      prisma.lpChatSignal.upsert({
        where: {
          landingPageId_category_periodDays: {
            landingPageId: result.lpId,
            category,
            periodDays,
          },
        },
        update: {
          count: data.count,
          sampleQuotes: data.samples,
          computedAt: new Date(),
        },
        create: {
          landingPageId: result.lpId,
          category,
          count: data.count,
          sampleQuotes: data.samples,
          periodDays,
          computedAt: new Date(),
        },
      }),
  )
  await Promise.all(ops)
}
