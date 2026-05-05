// POST /api/admin/alerts/read-all — tandai semua alert dibaca.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const r = await prisma.alert.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    })
    return jsonOk({ marked: r.count })
  } catch (err) {
    console.error('[POST /api/admin/alerts/read-all] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
