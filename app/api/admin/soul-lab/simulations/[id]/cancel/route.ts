// POST /api/admin/soul-lab/simulations/[id]/cancel — set status=CANCELLED.
// Engine cek status tiap iterasi → loop berhenti di ronde berikutnya.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params
  try {
    const sim = await prisma.soulSimulation.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!sim) return jsonError('Simulasi tidak ditemukan', 404)
    if (sim.status !== 'RUNNING') {
      return jsonError(`Simulasi sudah ${sim.status} — tidak bisa di-cancel`, 409)
    }
    await prisma.soulSimulation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })
    return jsonOk({ cancelled: true })
  } catch (err) {
    console.error('[POST /api/admin/soul-lab/simulations/:id/cancel] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
