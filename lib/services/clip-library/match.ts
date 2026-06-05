// Match service — pilih klip terbaik berdasarkan customer question.
//
// Strategy:
//   1. Embed customer question (text-embedding-3-small)
//   2. Load semua LiveClip aktif untuk host (filter isActive=true, status=READY, embedding NOT NULL)
//   3. Cosine similarity in-memory — pilih top-1
//   4. Fallback (kalau confidence < threshold):
//      a. Evergreen klip dengan confidence tertinggi (kalau ada)
//      b. Klip kategori IDLE / GENERAL (kalau ada)
//      c. Default-idle klip
//      d. null → caller handle text-only fallback ("Maaf saya belum punya jawaban...")
//   5. Log ke LiveClipUsage untuk analytics + bump useCount
//
// Performance: 1000 clips × 1536-dim cosine = ~5ms (numpy-equivalent loops).
// Memory: 1000 × 1536 × 4 bytes = 6MB per request — OK.
// Untuk scale 10k+ klip per host, migrasi ke pgvector di Sprint 5.

import { prisma } from '@/lib/prisma'

import { cosineSimilarity, embedText } from './embed'

export interface ClipMatch {
  clipId: string
  category: string
  videoUrl: string
  audioUrl: string | null
  transcript: string
  durationMs: number | null
  confidence: number // 0-1
  isEvergreen: boolean
  isFallback: boolean // true kalau dari fallback path (low confidence top-1)
}

export interface MatchClipInput {
  hostTemplateId: string
  question: string
  liveSessionId?: string | null
  // Threshold default — kalau top score di bawah ini, masuk fallback path.
  confidenceThreshold?: number
  // M5 (2026-06-05): Charge embed cost ke room owner. Required untuk audit/deduct.
  // Kalau gak provide, embed call gak charge (legacy compat).
  ownerUserId?: string
}

// Threshold 0.4 sebelumnya terlalu strict — Indonesian short phrases ("berapa
// harga?", "ada promo gak?") cosine sering 0.30-0.38 vs clip transcript ("Cuma
// 45rb kak, flash sale!"). Hasilnya fallback ke IDLE terus. 0.25 lebih realistis.
const DEFAULT_THRESHOLD = 0.25

// Type loose — Prisma JSON column return unknown.
interface ClipRow {
  id: string
  category: string
  videoUrl: string | null
  audioUrl: string | null
  transcript: string
  durationMs: number | null
  embedding: unknown
  isEvergreen: boolean
  isDefaultIdle: boolean
  isActive: boolean
  triggerKeywords: string[]
  matchMode: string
  manualConfidence: number | null
  useCount: number
  lastUsedAt: Date | null
}

// Normalize question buat keyword matching: lowercase + trim + collapse whitespace.
// Tidak strip punctuation — owner bisa pakai "?!" sebagai trigger kalau perlu.
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

// Cek apakah question mengandung salah satu keyword (case-insensitive substring).
function keywordHit(question: string, keywords: string[]): string | null {
  if (!keywords || keywords.length === 0) return null
  const q = normalize(question)
  for (const kw of keywords) {
    const k = normalize(kw)
    if (!k) continue
    if (q.includes(k)) return kw
  }
  return null
}

function getEmbeddingArray(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length === 0) return null
  // Prisma JSON deserialize sudah jadi number[].
  return raw as number[]
}

export async function matchClip(input: MatchClipInput): Promise<ClipMatch | null> {
  const question = input.question.trim()
  if (!question) return null

  const threshold = input.confidenceThreshold ?? DEFAULT_THRESHOLD

  // Load active clips DULU (no AI) — supaya kalau OpenAI down, keyword routing
  // tetap jalan. Embed dipanggil LATER hanya kalau Phase 1 (keyword) miss.
  const clips = (await prisma.liveClip.findMany({
    where: {
      hostTemplateId: input.hostTemplateId,
      isActive: true,
      status: 'READY',
      videoUrl: { not: null },
    },
    select: {
      id: true,
      category: true,
      videoUrl: true,
      audioUrl: true,
      transcript: true,
      durationMs: true,
      embedding: true,
      isEvergreen: true,
      isDefaultIdle: true,
      isActive: true,
      triggerKeywords: true,
      matchMode: true,
      manualConfidence: true,
      useCount: true,
      lastUsedAt: true,
    },
  })) as ClipRow[]

  if (clips.length === 0) return null

  // ── PHASE 1: KEYWORD PRIORITY CHECK ──────────────────────────────────────
  // Sebelum cosine, cek manual routing: klip dengan triggerKeywords yang match
  // → pilih PALING DULU (supervisor override). Skip kalau matchMode=COSINE
  // (default) — yang gak set keywords gak ada efek.
  // Priority untuk multiple match: KEYWORD_ONLY > KEYWORD_FIRST > BOOST (urutan
  // strictness). Kalau ada beberapa, pakai yg punya manualConfidence atau yg
  // duluan terdaftar.
  const keywordMatches: Array<{ clip: ClipRow; hit: string; mode: string }> = []
  for (const c of clips) {
    if (!c.videoUrl) continue
    if (c.matchMode === 'COSINE') continue // tidak pakai keyword
    const hit = keywordHit(input.question, c.triggerKeywords)
    if (hit) keywordMatches.push({ clip: c, hit, mode: c.matchMode })
  }
  if (keywordMatches.length > 0) {
    // Multi-tier sort:
    //   1. Match mode priority (KEYWORD_ONLY > KEYWORD_FIRST > BOOST)
    //   2. manualConfidence (force-confidence menang)
    //   3. LRU rotation — useCount ASC (yang jarang dipakai) → lastUsedAt ASC
    //      (yang udah lama gak dipakai). Tujuan: kalau 2+ klip GREETING semua
    //      trigger "halo", customer tidak ngalamin "stuck" di klip yang sama
    //      terus. Rotasi natural antar varian biar live lebih hidup.
    const priority = (m: string) =>
      m === 'KEYWORD_ONLY' ? 3 : m === 'KEYWORD_FIRST' ? 2 : m === 'BOOST' ? 1 : 0
    keywordMatches.sort((a, b) => {
      const p = priority(b.mode) - priority(a.mode)
      if (p !== 0) return p
      const mc = (b.clip.manualConfidence ?? 0) - (a.clip.manualConfidence ?? 0)
      if (mc !== 0) return mc
      // LRU tiebreaker — lower useCount + older lastUsedAt menang
      if (a.clip.useCount !== b.clip.useCount) return a.clip.useCount - b.clip.useCount
      const at = a.clip.lastUsedAt?.getTime() ?? 0
      const bt = b.clip.lastUsedAt?.getTime() ?? 0
      return at - bt // yg lebih lama gak dipakai duluan
    })
    const winner = keywordMatches[0]!
    const confidence = winner.clip.manualConfidence ?? 1.0
    // Log + bump useCount (sama seperti cosine path).
    await prisma.liveClipUsage
      .create({
        data: {
          clipId: winner.clip.id,
          liveSessionId: input.liveSessionId ?? null,
          question: input.question.slice(0, 1000),
          confidence,
        },
      })
      .catch((e) => console.warn('[matchClip:keyword] usage log gagal:', (e as Error).message))
    await prisma.liveClip
      .update({
        where: { id: winner.clip.id },
        data: {
          useCount: { increment: 1 },
          lastUsedAt: new Date(),
          avgConfidence: confidence,
        },
      })
      .catch((e) => console.warn('[matchClip:keyword] count bump gagal:', (e as Error).message))
    return {
      clipId: winner.clip.id,
      category: winner.clip.category,
      videoUrl: winner.clip.videoUrl as string,
      audioUrl: winner.clip.audioUrl,
      transcript: winner.clip.transcript,
      durationMs: winner.clip.durationMs,
      confidence,
      isEvergreen: winner.clip.isEvergreen,
      isFallback: false,
    }
  }

  // ── PHASE 2: COSINE SIMILARITY (need OpenAI embedding) ───────────────────
  // Embed dipanggil LATER — di sini, setelah keyword check miss. Kalau OpenAI
  // quota habis atau key invalid → fallback ke evergreen/defaultIdle (graceful
  // degradation, gak return null).
  let queryVec: number[] | null = null
  try {
    queryVec = await embedText(question, {
      userId: input.ownerUserId,
      subjectType: 'LIVE_MATCH',
      subjectId: input.liveSessionId ?? undefined,
    })
  } catch (e) {
    console.warn('[matchClip] embed gagal, fallback evergreen/idle:', (e as Error).message)
  }
  if (!queryVec) {
    // No embedding available → cuma bisa pilih fallback secara deterministic.
    const fallback =
      clips.find((c) => c.isEvergreen && c.videoUrl) ||
      clips.find((c) => c.isDefaultIdle && c.videoUrl) ||
      clips.find((c) => c.category === 'IDLE' && c.videoUrl)
    if (!fallback) return null
    await prisma.liveClipUsage
      .create({
        data: {
          clipId: fallback.id,
          liveSessionId: input.liveSessionId ?? null,
          question: question.slice(0, 1000),
          confidence: 0,
        },
      })
      .catch(() => {})
    await prisma.liveClip
      .update({
        where: { id: fallback.id },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
      })
      .catch(() => {})
    return {
      clipId: fallback.id,
      category: fallback.category,
      videoUrl: fallback.videoUrl as string,
      audioUrl: fallback.audioUrl,
      transcript: fallback.transcript,
      durationMs: fallback.durationMs,
      confidence: 0,
      isEvergreen: fallback.isEvergreen,
      isFallback: true,
    }
  }

  // Filter: skip klip yang matchMode=KEYWORD_ONLY (sudah missed di Phase 1,
  // tidak boleh masuk cosine — supervisor explicit hanya mau exact keyword).
  interface Scored {
    clip: ClipRow
    score: number
  }
  const scored: Scored[] = []
  for (const c of clips) {
    if (c.matchMode === 'KEYWORD_ONLY') continue // exact-only, skip
    const vec = getEmbeddingArray(c.embedding)
    if (!vec) continue
    if (!c.videoUrl) continue
    let sim = cosineSimilarity(queryVec, vec)
    // BOOST mode: kalau keyword TIDAK match tapi cosine semantik dekat, tambahin +0.15.
    // (Match keyword udah ditangani Phase 1 → di sini cuma boost klip yg semantik dekat
    // tapi gak ada keyword hit — biar gak terlalu tergeser oleh klip lain).
    if (c.matchMode === 'BOOST' && c.triggerKeywords.length > 0) sim += 0.15
    scored.push({ clip: c, score: sim })
  }

  if (scored.length === 0) return null

  // Sort descending. Tiebreaker: kalau 2+ klip skor mirip (Δ ≤ 0.03), pakai
  // LRU rotation supaya gak stuck di klip yang sama tiap pertanyaan mirip.
  scored.sort((a, b) => {
    const d = b.score - a.score
    if (Math.abs(d) > 0.03) return d
    // Close scores → LRU
    if (a.clip.useCount !== b.clip.useCount) return a.clip.useCount - b.clip.useCount
    const at = a.clip.lastUsedAt?.getTime() ?? 0
    const bt = b.clip.lastUsedAt?.getTime() ?? 0
    return at - bt
  })
  const top = scored[0]!
  let chosen = top
  let isFallback = false

  if (top.score < threshold) {
    isFallback = true
    // Prioritas fallback: evergreen score tertinggi → default-idle → category IDLE.
    const evergreen = scored.find((s) => s.clip.isEvergreen)
    if (evergreen) {
      chosen = evergreen
    } else {
      const defaultIdle = scored.find((s) => s.clip.isDefaultIdle)
      if (defaultIdle) {
        chosen = defaultIdle
      } else {
        const idleScore = scored.find((s) => s.clip.category === 'IDLE')
        if (idleScore) chosen = idleScore
        // else: top tetap dipilih (gak ada fallback yg lebih relevant)
      }
    }
  }

  if (!chosen.clip.videoUrl) return null

  // Log usage + bump useCount (best-effort, non-blocking critical path)
  await prisma.liveClipUsage
    .create({
      data: {
        clipId: chosen.clip.id,
        liveSessionId: input.liveSessionId ?? null,
        question: question.slice(0, 1000),
        confidence: top.score, // simpan top score sebenarnya (bukan chosen kalau fallback)
      },
    })
    .catch((e) => console.warn('[matchClip] usage log gagal:', (e as Error).message))

  await prisma.liveClip
    .update({
      where: { id: chosen.clip.id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
        avgConfidence:
          chosen === top
            ? top.score // simpel update — proper EMA di Sprint 5
            : undefined,
      },
    })
    .catch((e) => console.warn('[matchClip] count bump gagal:', (e as Error).message))

  return {
    clipId: chosen.clip.id,
    category: chosen.clip.category,
    videoUrl: chosen.clip.videoUrl,
    audioUrl: chosen.clip.audioUrl,
    transcript: chosen.clip.transcript,
    durationMs: chosen.clip.durationMs,
    confidence: chosen === top ? top.score : top.score, // tetap report top score
    isEvergreen: chosen.clip.isEvergreen,
    isFallback,
  }
}

// Helper: cari SEMUA klip idle yang layak untuk rotation client-side.
// Order: useCount asc (LRU — yang paling jarang dipakai duluan), supaya rotasi
// alami spread merata. Klip dengan isDefaultIdle=true di-include + kategori IDLE.
export async function findIdleClips(hostTemplateId: string): Promise<
  Array<{ clipId: string; videoUrl: string; durationMs: number | null }>
> {
  const clips = await prisma.liveClip.findMany({
    where: {
      hostTemplateId,
      isActive: true,
      status: 'READY',
      videoUrl: { not: null },
      OR: [{ isDefaultIdle: true }, { category: 'IDLE' }],
    },
    orderBy: [{ useCount: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, videoUrl: true, durationMs: true },
  })
  return clips
    .filter((c) => c.videoUrl != null)
    .map((c) => ({
      clipId: c.id,
      videoUrl: c.videoUrl as string,
      durationMs: c.durationMs,
    }))
}

// Legacy single-clip helper — keep untuk backward compat dengan code lama yang
// belum migrate ke array. Cuma ambil clip pertama dari findIdleClips().
export async function findIdleClip(hostTemplateId: string): Promise<{
  clipId: string
  videoUrl: string
  durationMs: number | null
} | null> {
  const clips = await findIdleClips(hostTemplateId)
  return clips[0] ?? null
}
