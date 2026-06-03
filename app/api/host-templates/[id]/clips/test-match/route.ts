// POST /api/host-templates/[id]/clips/test-match
// Simulate matching tanpa side-effect (no useCount bump, no usage log).
// Owner pakai untuk validate routing: "kalau customer bilang X, klip mana yg play?"
//
// Body: { question: string }
// Response: {
//   chosen: { clipId, category, summary, transcript, confidence, isFallback, isKeywordMatch } | null,
//   top3: Array<{ clipId, summary, category, score, source: 'keyword' | 'cosine' }>,
//   threshold: number,
// }

import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { cosineSimilarity, embedText } from '@/lib/services/clip-library/embed'

const schema = z.object({
  question: z.string().trim().min(1).max(500),
})

const DEFAULT_THRESHOLD = 0.25

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}
function keywordHit(question: string, keywords: string[]): string | null {
  if (!keywords?.length) return null
  const q = normalize(question)
  for (const kw of keywords) {
    const k = normalize(kw)
    if (k && q.includes(k)) return kw
  }
  return null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }
  const question = parsed.data.question

  const clips = await prisma.liveClip.findMany({
    where: { hostTemplateId: id, isActive: true, status: 'READY', videoUrl: { not: null } },
    select: {
      id: true,
      category: true,
      summary: true,
      transcript: true,
      embedding: true,
      isEvergreen: true,
      isDefaultIdle: true,
      triggerKeywords: true,
      matchMode: true,
      manualConfidence: true,
    },
  })
  if (clips.length === 0) {
    return jsonOk({ chosen: null, top3: [], threshold: DEFAULT_THRESHOLD, message: 'Belum ada klip aktif' })
  }

  // Phase 1: keyword check
  const keywordMatches = clips
    .map((c) => {
      if (c.matchMode === 'COSINE') return null
      const hit = keywordHit(question, c.triggerKeywords)
      if (!hit) return null
      return { clip: c, hit, mode: c.matchMode }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  let chosen: {
    clipId: string
    category: string
    summary: string | null
    transcript: string
    confidence: number
    isFallback: boolean
    isKeywordMatch: boolean
    keywordHit?: string
    matchMode?: string
  } | null = null

  if (keywordMatches.length > 0) {
    const priority = (m: string) =>
      m === 'KEYWORD_ONLY' ? 3 : m === 'KEYWORD_FIRST' ? 2 : m === 'BOOST' ? 1 : 0
    keywordMatches.sort((a, b) => {
      const p = priority(b.mode) - priority(a.mode)
      if (p !== 0) return p
      return (b.clip.manualConfidence ?? 0) - (a.clip.manualConfidence ?? 0)
    })
    const winner = keywordMatches[0]!
    chosen = {
      clipId: winner.clip.id,
      category: winner.clip.category,
      summary: winner.clip.summary,
      transcript: winner.clip.transcript,
      confidence: winner.clip.manualConfidence ?? 1.0,
      isFallback: false,
      isKeywordMatch: true,
      keywordHit: winner.hit,
      matchMode: winner.mode,
    }
  }

  // Phase 2: cosine
  let queryVec: number[]
  try {
    queryVec = await embedText(question)
  } catch (e) {
    return jsonError(`Embedding gagal: ${(e as Error).message}`, 500)
  }
  const scored = clips
    .filter((c) => c.matchMode !== 'KEYWORD_ONLY')
    .map((c) => {
      const raw = c.embedding
      if (!Array.isArray(raw) || raw.length === 0) return null
      let sim = cosineSimilarity(queryVec, raw as number[])
      if (c.matchMode === 'BOOST' && c.triggerKeywords.length > 0) sim += 0.15
      return { clip: c, score: sim }
    })
    .filter((x): x is { clip: typeof clips[0]; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)

  const top = scored[0] ?? null

  // Kalau gak ada keyword match, pakai cosine result
  if (!chosen && top) {
    const isFallback = top.score < DEFAULT_THRESHOLD
    chosen = {
      clipId: top.clip.id,
      category: top.clip.category,
      summary: top.clip.summary,
      transcript: top.clip.transcript,
      confidence: top.score,
      isFallback,
      isKeywordMatch: false,
    }
  }

  // Top 3 untuk display — combine keyword winners + cosine top scores
  const top3 = [
    ...keywordMatches.slice(0, 3).map((k) => ({
      clipId: k.clip.id,
      summary: k.clip.summary,
      category: k.clip.category,
      score: k.clip.manualConfidence ?? 1.0,
      source: 'keyword' as const,
      hit: k.hit,
    })),
    ...scored.slice(0, 3).map((s) => ({
      clipId: s.clip.id,
      summary: s.clip.summary,
      category: s.clip.category,
      score: Number(s.score.toFixed(3)),
      source: 'cosine' as const,
    })),
  ].slice(0, 5) // max 5 entries shown

  return jsonOk({ chosen, top3, threshold: DEFAULT_THRESHOLD })
}
