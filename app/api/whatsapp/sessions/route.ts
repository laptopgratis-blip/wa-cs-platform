// GET /api/whatsapp/sessions
// Daftar semua WA session milik user yang sedang login.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const sessions = await prisma.whatsappSession.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return jsonOk(sessions)
  } catch (err) {
    console.error('[GET /api/whatsapp/sessions] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
