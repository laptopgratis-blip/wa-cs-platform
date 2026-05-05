// POST /api/admin/alerts/[id]/read — tandai 1 alert sebagai dibaca.
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
    await prisma.alert.update({
      where: { id },
      data: { isRead: true },
    })
    return jsonOk({ id })
  } catch (err) {
    console.error('[POST /api/admin/alerts/:id/read] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
