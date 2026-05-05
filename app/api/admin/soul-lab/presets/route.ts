// GET  /api/admin/soul-lab/presets — list preset (semua admin lihat semua)
// POST /api/admin/soul-lab/presets — save setup sebagai preset
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { soulSimulationPresetCreateSchema } from '@/lib/validations/admin'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.soulSimulationPreset.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    })
    return jsonOk(rows)
  } catch (err) {
    console.error('[GET /api/admin/soul-lab/presets] gagal:', err)
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
  const parsed = soulSimulationPresetCreateSchema.safeParse(
    await req.json().catch(() => null),
  )
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  try {
    const created = await prisma.soulSimulationPreset.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        config: parsed.data.config as unknown as object,
        createdBy: session.user.id,
      },
    })
    return jsonOk(created, 201)
  } catch (err) {
    console.error('[POST /api/admin/soul-lab/presets] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
