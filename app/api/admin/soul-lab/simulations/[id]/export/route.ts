// GET /api/admin/soul-lab/simulations/[id]/export — download .md transkrip
// + evaluasi simulasi. Format readable supaya admin bisa share/arsip.
import type { NextResponse } from 'next/server'

import { jsonError, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { buildMarkdownExport } from '@/lib/services/soul-simulation'

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
        sellerPersonality: { select: { name: true } },
        sellerStyle: { select: { name: true } },
        buyerPersonality: { select: { name: true } },
        buyerStyle: { select: { name: true } },
        sellerSoul: { select: { name: true } }, // legacy
        buyerSoul: { select: { name: true } },  // legacy
        sellerModel: { select: { name: true } },
        buyerModel: { select: { name: true } },
      },
    })
    if (!sim) return jsonError('Simulasi tidak ditemukan', 404)

    const md = buildMarkdownExport({
      simulation: {
        id: sim.id,
        createdAt: sim.createdAt,
        sellerPersonality: sim.sellerPersonality,
        sellerStyle: sim.sellerStyle,
        buyerPersonality: sim.buyerPersonality,
        buyerStyle: sim.buyerStyle,
        sellerSoul: sim.sellerSoul,
        buyerSoul: sim.buyerSoul,
        sellerModel: sim.sellerModel,
        buyerModel: sim.buyerModel,
        sellerContext: sim.sellerContext,
        buyerScenario: sim.buyerScenario,
        conversation: sim.conversation,
        evaluationScore: sim.evaluationScore,
        evaluationData: sim.evaluationData,
        outcome: sim.outcome,
        totalCostRp: sim.totalCostRp,
        totalRounds: sim.totalRounds,
      },
    })

    const filename = `soul-simulation-${sim.id.slice(0, 8)}.md`
    return new Response(md, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/soul-lab/simulations/:id/export] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
