// POST /api/admin/soul-lab/estimate-cost — preview biaya simulasi sebelum
// dimulai. Body: { sellerModelId, buyerModelId, totalRounds }
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { estimateSimulationCostRp } from '@/lib/services/soul-simulation'

const schema = z.object({
  sellerModelId: z.string().min(1),
  buyerModelId: z.string().min(1),
  totalRounds: z.number().int().min(2).max(30),
})

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const [sellerModel, buyerModel] = await Promise.all([
      prisma.aiModel.findUnique({ where: { id: parsed.data.sellerModelId } }),
      prisma.aiModel.findUnique({ where: { id: parsed.data.buyerModelId } }),
    ])
    if (!sellerModel) return jsonError('Model penjual tidak ditemukan', 404)
    if (!buyerModel) return jsonError('Model pembeli tidak ditemukan', 404)
    const estimateRp = await estimateSimulationCostRp({
      sellerModel,
      buyerModel,
      totalRounds: parsed.data.totalRounds,
    })
    return jsonOk({ estimateRp: Math.ceil(estimateRp) })
  } catch (err) {
    console.error('[POST /api/admin/soul-lab/estimate-cost] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
