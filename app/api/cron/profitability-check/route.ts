// POST /api/cron/profitability-check
// Dipanggil dari cron eksternal (cron-job.org / Vercel Cron) tiap 1 jam.
// Cek 3 kondisi dalam 24 jam terakhir, generate Alert sesuai kategori.
//
// Auth: header `x-cron-secret` == CRON_SECRET env var.
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { getPricingSettings } from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'

const ANOMALY_INPUT_TOKEN_THRESHOLD = 5000
const PROFIT_NEGATIVE_THRESHOLD_RP = -1000
const MARGIN_LOW_THRESHOLD_PCT = 30

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET tidak di-set' },
      { status: 500 },
    )
  }
  if (req.headers.get('x-cron-secret') !== expected) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await getPricingSettings() // warm cache

  // Ambil aggregate per model untuk 24 jam terakhir.
  const modelAgg = await prisma.$queryRaw<
    Array<{
      modelId: string
      name: string
      count: bigint
      profitRp: number | null
      revenueRp: number | null
    }>
  >(Prisma.sql`
    SELECT
      m."id" AS "modelId",
      m."name" AS "name",
      COUNT(*)::bigint AS "count",
      SUM(msg."profitRp") AS "profitRp",
      SUM(msg."revenueRp") AS "revenueRp"
    FROM "Message" msg
    JOIN "WhatsappSession" ws ON msg."waSessionId" = ws."id"
    JOIN "AiModel" m ON ws."modelId" = m."id"
    WHERE msg."role" = 'AI' AND msg."createdAt" >= ${since}
    GROUP BY m."id", m."name"
  `)

  const created: { id: string; level: string; category: string }[] = []

  for (const r of modelAgg) {
    const profit = r.profitRp ?? 0
    const revenue = r.revenueRp ?? 0
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : -100
    if (profit < PROFIT_NEGATIVE_THRESHOLD_RP) {
      const a = await prisma.alert.create({
        data: {
          level: 'RED',
          category: 'PROFIT_NEGATIVE',
          title: `Model "${r.name}" rugi`,
          message: `Total profit 24 jam: Rp ${profit.toFixed(0)} (${Number(r.count)} pesan). Periksa harga API dan setting costPerMessage.`,
          metadata: {
            modelId: r.modelId,
            profitRp: profit,
            messages: Number(r.count),
          },
        },
      })
      created.push({ id: a.id, level: a.level, category: a.category })
      continue
    }
    if (marginPct < MARGIN_LOW_THRESHOLD_PCT) {
      const a = await prisma.alert.create({
        data: {
          level: 'YELLOW',
          category: 'MARGIN_LOW',
          title: `Margin "${r.name}" tipis`,
          message: `Margin 24 jam: ${marginPct.toFixed(1)}% (di bawah ${MARGIN_LOW_THRESHOLD_PCT}%).`,
          metadata: {
            modelId: r.modelId,
            marginPct,
            messages: Number(r.count),
          },
        },
      })
      created.push({ id: a.id, level: a.level, category: a.category })
    }
  }

  // Anomali: pesan dengan input token sangat besar (history terlalu panjang).
  const anomalies = await prisma.message.count({
    where: {
      role: 'AI',
      createdAt: { gte: since },
      apiInputTokens: { gt: ANOMALY_INPUT_TOKEN_THRESHOLD },
    },
  })
  if (anomalies > 0) {
    const a = await prisma.alert.create({
      data: {
        level: 'YELLOW',
        category: 'ANOMALY',
        title: `${anomalies} pesan dengan input token > ${ANOMALY_INPUT_TOKEN_THRESHOLD}`,
        message: `Kemungkinan history percakapan terlalu panjang. Pertimbangkan trim window history.`,
        metadata: { count: anomalies, threshold: ANOMALY_INPUT_TOKEN_THRESHOLD },
      },
    })
    created.push({ id: a.id, level: a.level, category: a.category })
  }

  // ───────────────────────────────────────────────────────────────────────
  // Per-feature profitability (AiGenerationLog) — Content Studio + future
  // AI feature lain. Aggregate by featureKey untuk 24h terakhir.
  // ───────────────────────────────────────────────────────────────────────
  const featureAgg = await prisma.aiGenerationLog.groupBy({
    by: ['featureKey'],
    where: {
      createdAt: { gte: since },
      status: 'OK',
    },
    _sum: {
      profitRp: true,
      revenueRp: true,
    },
    _count: true,
  })
  for (const r of featureAgg) {
    const profit = r._sum.profitRp ?? 0
    const revenue = r._sum.revenueRp ?? 0
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : -100
    const calls = r._count
    if (profit < PROFIT_NEGATIVE_THRESHOLD_RP) {
      const a = await prisma.alert.create({
        data: {
          level: 'RED',
          category: 'PROFIT_NEGATIVE',
          title: `Feature "${r.featureKey}" rugi`,
          message: `Total profit 24 jam: Rp ${profit.toFixed(0)} (${calls} call). Cek AiFeatureConfig: rate / margin / cap.`,
          metadata: {
            featureKey: r.featureKey,
            profitRp: profit,
            calls,
            scope: 'AI_FEATURE',
          },
        },
      })
      created.push({ id: a.id, level: a.level, category: a.category })
      continue
    }
    if (marginPct < MARGIN_LOW_THRESHOLD_PCT) {
      const a = await prisma.alert.create({
        data: {
          level: 'YELLOW',
          category: 'MARGIN_LOW',
          title: `Margin feature "${r.featureKey}" tipis`,
          message: `Margin 24 jam: ${marginPct.toFixed(1)}% (di bawah ${MARGIN_LOW_THRESHOLD_PCT}%) dari ${calls} call. Naikan platformMargin atau adjust pricePerToken.`,
          metadata: {
            featureKey: r.featureKey,
            marginPct,
            calls,
            scope: 'AI_FEATURE',
          },
        },
      })
      created.push({ id: a.id, level: a.level, category: a.category })
    }
  }

  // Anomali per-feature: input token > threshold (lebih agresif dibanding
  // chatbot karena prompt feature biasanya bounded).
  const featureAnomalies = await prisma.aiGenerationLog.count({
    where: {
      createdAt: { gte: since },
      inputTokens: { gt: ANOMALY_INPUT_TOKEN_THRESHOLD },
    },
  })
  if (featureAnomalies > 0) {
    const a = await prisma.alert.create({
      data: {
        level: 'YELLOW',
        category: 'ANOMALY',
        title: `${featureAnomalies} AI feature call dengan input > ${ANOMALY_INPUT_TOKEN_THRESHOLD}`,
        message: `Cek feature mana yg loop / context terlalu besar. Lihat AiGenerationLog untuk detail per call.`,
        metadata: { count: featureAnomalies, scope: 'AI_FEATURE' },
      },
    })
    created.push({ id: a.id, level: a.level, category: a.category })
  }

  return NextResponse.json({
    success: true,
    data: { created: created.length, items: created },
  })
}
