// POST /api/admin/ai-features/bulk-margin
// Apply platformMargin global ke semua AiFeatureConfig (atau hanya yang aktif).
// Body: { margin: number, scope?: 'all' | 'active' }.
// Return: { updated: number }.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { invalidateAiFeatureConfigCache } from '@/lib/services/ai-feature-config'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  margin: z.number().min(0.5).max(10),
  scope: z.enum(['all', 'active']).default('all'),
})

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const where = parsed.data.scope === 'active' ? { isActive: true } : {}
    const result = await prisma.aiFeatureConfig.updateMany({
      where,
      data: { platformMargin: parsed.data.margin },
    })
    if (result.count > 0) invalidateAiFeatureConfigCache()
    return jsonOk({ updated: result.count })
  } catch (err) {
    console.error('[POST /api/admin/ai-features/bulk-margin] gagal:', err)
    return jsonError(
      err instanceof Error ? err.message : 'Terjadi kesalahan server',
      500,
    )
  }
}
