// GET /api/admin/wa-sessions-connected
// Return semua WhatsappSession berstatus CONNECTED, untuk dipilih sebagai
// sender OTP auth di /admin/settings. Include owner email biar admin tau
// siapa yang punya session.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const sessions = await prisma.whatsappSession.findMany({
      where: { status: 'CONNECTED' },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        updatedAt: true,
        user: { select: { email: true, role: true } },
      },
    })
    return jsonOk(sessions)
  } catch (err) {
    console.error('[GET /api/admin/wa-sessions-connected] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
