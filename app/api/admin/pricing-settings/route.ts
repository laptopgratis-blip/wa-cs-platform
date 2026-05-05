// GET   /api/admin/pricing-settings — singleton
// PATCH /api/admin/pricing-settings — partial update
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import {
  getPricingSettings,
  invalidatePricingCache,
} from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({
  marginTarget: z.number().min(0).max(99).optional(),
  estimatedInputTokens: z.number().int().min(0).max(1_000_000).optional(),
  estimatedOutputTokens: z.number().int().min(0).max(1_000_000).optional(),
  usdRate: z.number().positive().max(1_000_000).optional(),
  pricePerToken: z.number().positive().max(10_000).optional(),
})

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const v = await getPricingSettings()
  return jsonOk({
    id: v.id,
    marginTarget: v.marginTarget,
    estimatedInputTokens: v.estimatedInputTokens,
    estimatedOutputTokens: v.estimatedOutputTokens,
    usdRate: v.usdRate,
    pricePerToken: v.pricePerToken,
    updatedAt: v.updatedAt.toISOString(),
  })
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    // Singleton — pakai upsert dengan id default kalau belum ada.
    const existing = await prisma.pricingSettings.findFirst()
    const saved = existing
      ? await prisma.pricingSettings.update({
          where: { id: existing.id },
          data: parsed.data,
        })
      : await prisma.pricingSettings.create({
          data: { id: 'default', ...parsed.data },
        })
    invalidatePricingCache()
    return jsonOk({
      id: saved.id,
      marginTarget: saved.marginTarget,
      estimatedInputTokens: saved.estimatedInputTokens,
      estimatedOutputTokens: saved.estimatedOutputTokens,
      usdRate: saved.usdRate,
      pricePerToken: saved.pricePerToken,
      updatedAt: saved.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[PATCH /api/admin/pricing-settings] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
