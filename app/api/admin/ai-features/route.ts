// GET    /api/admin/ai-features — list all configs
// POST   /api/admin/ai-features — create new (mis. featureKey baru)
// PATCH  /api/admin/ai-features — update existing (by id)
//
// Admin only.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { invalidateAiFeatureConfigCache } from '@/lib/services/ai-feature-config'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const features = await prisma.aiFeatureConfig.findMany({
    orderBy: { displayName: 'asc' },
  })
  return jsonOk({ features })
}

const createSchema = z.object({
  featureKey: z.string().min(2).max(64),
  displayName: z.string().min(2).max(120),
  modelName: z.string().min(2).max(80),
  inputPricePer1M: z.number().min(0).max(1000),
  outputPricePer1M: z.number().min(0).max(1000),
  platformMargin: z.number().min(0.5).max(10).optional(),
  floorTokens: z.number().int().min(0).max(1_000_000).optional(),
  // capTokens 0 = tidak di-enforce (default skema fair-pricing).
  capTokens: z.number().int().min(0).max(10_000_000).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(500).optional(),
})

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')

  try {
    const created = await prisma.aiFeatureConfig.create({
      data: {
        featureKey: parsed.data.featureKey.toUpperCase(),
        displayName: parsed.data.displayName,
        modelName: parsed.data.modelName,
        inputPricePer1M: parsed.data.inputPricePer1M,
        outputPricePer1M: parsed.data.outputPricePer1M,
        platformMargin: parsed.data.platformMargin ?? 2.0,
        floorTokens: parsed.data.floorTokens ?? 10,
        capTokens: parsed.data.capTokens ?? 0,
        isActive: parsed.data.isActive ?? true,
        description: parsed.data.description,
      },
    })
    invalidateAiFeatureConfigCache()
    return jsonOk({ feature: created })
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : 'Gagal create',
      400,
    )
  }
}

const patchSchema = z.object({
  id: z.string(),
  displayName: z.string().min(2).max(120).optional(),
  modelName: z.string().min(2).max(80).optional(),
  inputPricePer1M: z.number().min(0).max(1000).optional(),
  outputPricePer1M: z.number().min(0).max(1000).optional(),
  platformMargin: z.number().min(0.5).max(10).optional(),
  floorTokens: z.number().int().min(0).max(1_000_000).optional(),
  capTokens: z.number().int().min(0).max(10_000_000).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(500).nullable().optional(),
})

export async function PATCH(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')

  try {
    const { id, ...rest } = parsed.data
    const updated = await prisma.aiFeatureConfig.update({
      where: { id },
      data: rest,
    })
    invalidateAiFeatureConfigCache()
    return jsonOk({ feature: updated })
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal update', 400)
  }
}
