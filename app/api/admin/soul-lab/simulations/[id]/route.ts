// GET /api/admin/soul-lab/simulations/[id] — single simulation state untuk
// polling. Return: status, currentRound, conversation, evaluationData, cost.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const sim = await prisma.soulSimulation.findUnique({
      where: { id },
      include: {
        // Schema baru
        sellerPersonality: { select: { id: true, name: true } },
        sellerStyle: { select: { id: true, name: true } },
        buyerPersonality: { select: { id: true, name: true } },
        buyerStyle: { select: { id: true, name: true } },
        // Legacy fallback
        sellerSoul: { select: { id: true, name: true } },
        buyerSoul: { select: { id: true, name: true } },
        sellerModel: { select: { id: true, name: true, provider: true } },
        buyerModel: { select: { id: true, name: true, provider: true } },
        triggerUser: { select: { id: true, name: true, email: true } },
      },
    })
    if (!sim) return jsonError('Simulasi tidak ditemukan', 404)
    return jsonOk(sim)
  } catch (err) {
    console.error('[GET /api/admin/soul-lab/simulations/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
