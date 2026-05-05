// PATCH /api/admin/models/[modelId]/cost-per-message
// Update khusus field costPerMessage (token yang dipotong user per AI reply).
// Dipakai dari halaman Pricing Calculator untuk apply rekomendasi cepat.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ modelId: string }>
}

const bodySchema = z.object({
  costPerMessage: z.number().int().positive().max(100_000),
})

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { modelId } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const updated = await prisma.aiModel.update({
      where: { id: modelId },
      data: { costPerMessage: parsed.data.costPerMessage },
      select: { id: true, costPerMessage: true },
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/admin/models/:id/cost-per-message] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
