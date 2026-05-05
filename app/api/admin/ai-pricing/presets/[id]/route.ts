// PATCH /api/admin/ai-pricing/presets/[id] — manual edit.
// Set lastUpdatedSource='manual' supaya bisa dibedakan dari ai-research.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

const updateSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  inputPricePer1M: z.number().nonnegative().max(10_000).optional(),
  outputPricePer1M: z.number().nonnegative().max(10_000).optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isAvailable: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const updated = await prisma.aiModelPreset.update({
      where: { id },
      data: {
        ...parsed.data,
        lastUpdatedSource: 'manual',
        lastUpdatedAt: new Date(),
      },
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/ai-pricing/presets/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
