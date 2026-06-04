// GET /api/host-templates/[id]/clips/analytics — usage insight per host.
//
// Output:
//   - topClips: 5 klip dengan use count tertinggi
//   - lowConfidenceQuestions: 10 pertanyaan customer yang match dengan confidence <0.4
//                              (signal owner perlu rekam klip baru untuk topik itu)
//   - coverage: % chat yang match (confidence ≥ 0.4) vs total

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
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
    select: { id: true, userId: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }

  const topClips = await prisma.liveClip.findMany({
    where: { hostTemplateId: id, isActive: true, status: 'READY' },
    orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
    take: 5,
    select: {
      id: true,
      transcript: true,
      category: true,
      useCount: true,
      lastUsedAt: true,
      avgConfidence: true,
    },
  })

  // Low-confidence usages — agregat per question text (truncated) untuk dedup.
  const recentLowConf = await prisma.liveClipUsage.findMany({
    where: {
      clip: { hostTemplateId: id },
      confidence: { lt: 0.4 },
      matchedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30hr
    },
    orderBy: { matchedAt: 'desc' },
    take: 100,
    select: { question: true, confidence: true, matchedAt: true },
  })
  // Group by lowercase question for dedup
  const grouped = new Map<string, { count: number; lastSeen: Date; avgConf: number }>()
  for (const u of recentLowConf) {
    const key = u.question.toLowerCase().slice(0, 100)
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      existing.avgConf = (existing.avgConf * (existing.count - 1) + u.confidence) / existing.count
      if (u.matchedAt > existing.lastSeen) existing.lastSeen = u.matchedAt
    } else {
      grouped.set(key, { count: 1, lastSeen: u.matchedAt, avgConf: u.confidence })
    }
  }
  const lowConfidenceQuestions = Array.from(grouped.entries())
    .map(([question, stats]) => ({
      question,
      count: stats.count,
      avgConfidence: Math.round(stats.avgConf * 100) / 100,
      lastSeen: stats.lastSeen.toISOString(),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Coverage: % usages dengan confidence ≥ 0.4
  const totalUsages = await prisma.liveClipUsage.count({
    where: { clip: { hostTemplateId: id } },
  })
  const goodUsages = await prisma.liveClipUsage.count({
    where: { clip: { hostTemplateId: id }, confidence: { gte: 0.4 } },
  })
  const coverage = totalUsages > 0 ? Math.round((goodUsages / totalUsages) * 100) : 0

  return jsonOk({
    topClips,
    lowConfidenceQuestions,
    coverage,
    totalUsages,
  })
}
