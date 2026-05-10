// PATCH /api/content/ads/variants/[variantId]
// Update performance metric per variant (impressions/clicks/CTR/conversions/spendRp).
// Ownership check via piece.userId.
//
// DELETE /api/content/ads/variants/[variantId]
// Hapus variant (kalau user mau prune variant tertentu).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ variantId: string }>
}

const patchSchema = z.object({
  value: z.string().min(1).max(2000).optional(),
  impressions: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  clicks: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  conversions: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  spendRp: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { variantId } = await params

  // Verify ownership lewat join ke ContentPiece.userId
  const variant = await prisma.adVariant.findUnique({
    where: { id: variantId },
    include: { piece: { select: { userId: true } } },
  })
  if (!variant || variant.piece.userId !== session.user.id) {
    return jsonError('Variant tidak ditemukan', 404)
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')

  const { value, impressions, clicks, conversions, spendRp } = parsed.data
  const data: Record<string, unknown> = {}
  if (value !== undefined) data.value = value
  // Compute CTR di server kalau impressions+clicks ada (impressions > 0)
  if (impressions !== undefined) data.impressions = impressions
  if (clicks !== undefined) data.clicks = clicks
  if (conversions !== undefined) data.conversions = conversions
  if (spendRp !== undefined) data.spendRp = spendRp

  const willChangeMetric =
    impressions !== undefined ||
    clicks !== undefined ||
    conversions !== undefined ||
    spendRp !== undefined
  if (willChangeMetric) {
    data.metricUpdatedAt = new Date()
    // CTR auto-compute dari nilai final (merge with existing).
    const finalImpressions = impressions ?? variant.impressions
    const finalClicks = clicks ?? variant.clicks
    if (
      finalImpressions !== null &&
      finalImpressions !== undefined &&
      finalClicks !== null &&
      finalClicks !== undefined &&
      finalImpressions > 0
    ) {
      data.ctr = finalClicks / finalImpressions
    } else {
      data.ctr = null
    }
  }

  const updated = await prisma.adVariant.update({
    where: { id: variantId },
    data,
  })

  return jsonOk({ variant: updated })
}

export async function DELETE(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { variantId } = await params
  const variant = await prisma.adVariant.findUnique({
    where: { id: variantId },
    include: { piece: { select: { userId: true } } },
  })
  if (!variant || variant.piece.userId !== session.user.id) {
    return jsonError('Variant tidak ditemukan', 404)
  }
  await prisma.adVariant.delete({ where: { id: variantId } })
  return jsonOk({ ok: true })
}
