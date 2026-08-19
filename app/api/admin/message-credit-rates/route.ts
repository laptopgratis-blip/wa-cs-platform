// GET   /api/admin/message-credit-rates — harga Kredit Pesan per kategori +
//       ringkasan pemakaian 30 hari.
// PATCH /api/admin/message-credit-rates {category, priceRp, metaUsd?}
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { DEFAULT_CREDIT_RATES, invalidateRateCache } from '@/lib/services/message-credits'

const patchSchema = z.object({
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  priceRp: z.number().int().min(0).max(1_000_000),
  metaUsd: z.number().min(0).max(10).nullable().optional(),
})

const DAYS_30 = 30 * 24 * 60 * 60 * 1000

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.messageCreditRate.findMany({ orderBy: { category: 'asc' } })
    const byCat = new Map(rows.map((r) => [r.category, r]))
    const rates = (['UTILITY', 'MARKETING', 'AUTHENTICATION'] as const).map((c) => ({
      category: c,
      priceRp: byCat.get(c)?.priceRp ?? DEFAULT_CREDIT_RATES[c],
      metaUsd: byCat.get(c)?.metaUsd ?? null,
      updatedAt: byCat.get(c)?.updatedAt?.toISOString() ?? null,
      seeded: !byCat.has(c),
    }))

    const since = new Date(Date.now() - DAYS_30)
    const usage = await prisma.messageCreditTransaction.groupBy({
      by: ['type', 'category'],
      where: { createdAt: { gte: since } },
      _sum: { amountRp: true },
      _count: { _all: true },
    })
    const totals = await prisma.tokenBalance.aggregate({
      _sum: { messageCreditRp: true, messageCreditPurchased: true, messageCreditUsed: true },
      _count: { _all: true },
    })
    return jsonOk({
      rates,
      usage30d: usage.map((u) => ({
        type: u.type,
        category: u.category,
        amountRp: u._sum.amountRp ?? 0,
        count: u._count._all,
      })),
      totals: {
        outstandingRp: totals._sum.messageCreditRp ?? 0,
        purchasedRp: totals._sum.messageCreditPurchased ?? 0,
        usedRp: totals._sum.messageCreditUsed ?? 0,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/message-credit-rates] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  try {
    const row = await prisma.messageCreditRate.upsert({
      where: { category: parsed.data.category },
      create: {
        category: parsed.data.category,
        priceRp: parsed.data.priceRp,
        metaUsd: parsed.data.metaUsd ?? null,
      },
      update: {
        priceRp: parsed.data.priceRp,
        ...(parsed.data.metaUsd !== undefined ? { metaUsd: parsed.data.metaUsd } : {}),
      },
    })
    invalidateRateCache()
    return jsonOk(row)
  } catch (err) {
    console.error('[PATCH /api/admin/message-credit-rates] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
