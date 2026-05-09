// GET  /api/admin/soul-lab/simulations — list history (pagination, filter)
// POST /api/admin/soul-lab/simulations — create + trigger run async
//
// Trigger run: kita TIDAK await runSimulation() supaya request handler cepat
// balas. Engine update DB per ronde — UI polling.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { runSimulation } from '@/lib/services/soul-simulation'
import { soulSimulationCreateSchema } from '@/lib/validations/admin'

const PAGE_SIZE = 50

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? undefined
  // Filter by sellerPersonalityId (kanonik) atau sellerSoulId (legacy) supaya
  // admin masih bisa filter sim lama dari history.
  const sellerPersonalityId = url.searchParams.get('sellerPersonalityId') ?? undefined
  const sellerSoulId = url.searchParams.get('sellerSoulId') ?? undefined
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)

  const where: Record<string, unknown> = {}
  if (status && ['RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
    where.status = status
  }
  if (sellerPersonalityId) where.sellerPersonalityId = sellerPersonalityId
  if (sellerSoulId) where.sellerSoulId = sellerSoulId
  if (dateFrom || dateTo) {
    const range: Record<string, Date> = {}
    if (dateFrom) range.gte = new Date(dateFrom)
    if (dateTo) range.lte = new Date(dateTo)
    where.createdAt = range
  }

  try {
    const [items, total] = await Promise.all([
      prisma.soulSimulation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          // Schema baru
          sellerPersonality: { select: { id: true, name: true } },
          sellerStyle: { select: { id: true, name: true } },
          buyerPersonality: { select: { id: true, name: true } },
          buyerStyle: { select: { id: true, name: true } },
          // Legacy (untuk row pra-migrasi)
          sellerSoul: { select: { id: true, name: true } },
          buyerSoul: { select: { id: true, name: true } },
          sellerModel: { select: { id: true, name: true } },
          buyerModel: { select: { id: true, name: true } },
          triggerUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.soulSimulation.count({ where }),
    ])
    return jsonOk({
      items,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    })
  } catch (err) {
    console.error('[GET /api/admin/soul-lab/simulations] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = soulSimulationCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  const data = parsed.data

  // Validasi: Personality + Style + Model harus ada & aktif.
  const [sellerPers, sellerStyle, buyerPers, buyerStyle, sellerModel, buyerModel] =
    await Promise.all([
      prisma.soulPersonality.findUnique({ where: { id: data.sellerPersonalityId } }),
      prisma.soulStyle.findUnique({ where: { id: data.sellerStyleId } }),
      prisma.soulPersonality.findUnique({ where: { id: data.buyerPersonalityId } }),
      prisma.soulStyle.findUnique({ where: { id: data.buyerStyleId } }),
      prisma.aiModel.findUnique({ where: { id: data.sellerModelId } }),
      prisma.aiModel.findUnique({ where: { id: data.buyerModelId } }),
    ])
  if (!sellerPers || !sellerPers.isActive) {
    return jsonError('Kepribadian penjual tidak ditemukan / non-aktif', 400)
  }
  if (!sellerStyle || !sellerStyle.isActive) {
    return jsonError('Gaya balas penjual tidak ditemukan / non-aktif', 400)
  }
  if (!buyerPers || !buyerPers.isActive) {
    return jsonError('Kepribadian pembeli tidak ditemukan / non-aktif', 400)
  }
  if (!buyerStyle || !buyerStyle.isActive) {
    return jsonError('Gaya balas pembeli tidak ditemukan / non-aktif', 400)
  }
  if (!sellerModel || !sellerModel.isActive) {
    return jsonError('Model penjual tidak aktif', 400)
  }
  if (!buyerModel || !buyerModel.isActive) {
    return jsonError('Model pembeli tidak aktif', 400)
  }

  try {
    const sim = await prisma.soulSimulation.create({
      data: {
        triggeredBy: session.user.id,
        sellerPersonalityId: data.sellerPersonalityId,
        sellerStyleId: data.sellerStyleId,
        sellerModelId: data.sellerModelId,
        sellerContext: data.sellerContext,
        buyerPersonalityId: data.buyerPersonalityId,
        buyerStyleId: data.buyerStyleId,
        buyerModelId: data.buyerModelId,
        buyerScenario: data.buyerScenario,
        totalRounds: data.totalRounds,
        starterRole: data.starterRole,
        starterMessage: data.starterMessage,
        sellerKnowledgeIds: data.sellerKnowledgeIds,
        status: 'RUNNING',
      },
    })

    // Trigger async — jangan await. Engine update DB per ronde, UI polling.
    void runSimulation(sim.id).catch((err) => {
      console.error(`[soul-lab] runSimulation ${sim.id} crashed:`, err)
    })

    return jsonOk({ id: sim.id }, 201)
  } catch (err) {
    console.error('[POST /api/admin/soul-lab/simulations] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
