// GET /api/lp/generate/stats — return statistik AI generation milik user.
// Dipakai LpManager untuk tampil "X kali generate · ~$Y / Rp Z".
//
// Sumber data: tabel LpGeneration (ada per call, snapshot harga).
// Generations PRA-2026-05-09 (sebelum audit table dibuat) tidak punya row
// di tabel ini → di-estimasi pakai average token/call × harga model.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

// Estimasi rata-rata Haiku 4.5 untuk LP generation berdasarkan ukuran prompt
// + output HTML khas. Dipakai untuk historical generations yang TIDAK punya
// row di LpGeneration table (data legacy sebelum audit table dibuat).
const LEGACY_AVG_INPUT_TOKENS = 1500
const LEGACY_AVG_OUTPUT_TOKENS = 8000
const LEGACY_HAIKU_INPUT_USD_PER_1M = 1
const LEGACY_HAIKU_OUTPUT_USD_PER_1M = 5

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    // 1. Aggregate dari LpGeneration audit table (data akurat).
    const audited = await prisma.lpGeneration.aggregate({
      where: { userId: session.user.id },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        providerCostUsd: true,
        providerCostRp: true,
        platformTokensCharged: true,
      },
    })

    // 2. Hitung legacy generations: TokenTransaction USAGE 'Generate LP AI'
    //    yang TIDAK punya row LpGeneration matching (audit table baru).
    const totalTxn = await prisma.tokenTransaction.count({
      where: {
        userId: session.user.id,
        type: 'USAGE',
        description: 'Generate LP AI',
      },
    })
    const legacyCount = Math.max(0, totalTxn - audited._count._all)
    const legacyUsdRate = await prisma.pricingSettings
      .findFirst({ select: { usdRate: true } })
      .then((s) => s?.usdRate ?? 16_000)
      .catch(() => 16_000)
    const legacyInputTokens = legacyCount * LEGACY_AVG_INPUT_TOKENS
    const legacyOutputTokens = legacyCount * LEGACY_AVG_OUTPUT_TOKENS
    const legacyProviderCostUsd =
      (legacyInputTokens / 1_000_000) * LEGACY_HAIKU_INPUT_USD_PER_1M +
      (legacyOutputTokens / 1_000_000) * LEGACY_HAIKU_OUTPUT_USD_PER_1M
    const legacyProviderCostRp = legacyProviderCostUsd * legacyUsdRate

    // 3. Last 5 generations (audited only — historis tidak punya per-call data).
    const recent = await prisma.lpGeneration.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        lpId: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        providerCostUsd: true,
        providerCostRp: true,
        platformTokensCharged: true,
        createdAt: true,
        lp: { select: { title: true } },
      },
    })

    return jsonOk({
      totalGenerations: audited._count._all + legacyCount,
      audited: {
        count: audited._count._all,
        inputTokens: audited._sum.inputTokens ?? 0,
        outputTokens: audited._sum.outputTokens ?? 0,
        providerCostUsd: audited._sum.providerCostUsd ?? 0,
        providerCostRp: audited._sum.providerCostRp ?? 0,
        platformTokensCharged: audited._sum.platformTokensCharged ?? 0,
      },
      legacy: {
        count: legacyCount,
        // Estimasi karena per-call token tidak tercatat. Disclaimer di UI.
        estimatedProviderCostUsd: legacyProviderCostUsd,
        estimatedProviderCostRp: legacyProviderCostRp,
      },
      recent: recent.map((r) => ({
        id: r.id,
        lpId: r.lpId,
        lpTitle: r.lp.title,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        providerCostUsd: r.providerCostUsd,
        providerCostRp: r.providerCostRp,
        platformTokensCharged: r.platformTokensCharged,
        createdAt: r.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/lp/generate/stats] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
