// DELETE /api/admin/soul-lab/presets/[id] — hapus preset
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    await prisma.soulSimulationPreset.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/admin/soul-lab/presets/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
