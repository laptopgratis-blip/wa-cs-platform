// GET /api/whatsapp/[sessionId]/socket-token
// Mint token HMAC short-lived untuk subscribe Socket.io ke wa-service.
// Hanya pemilik session yang bisa minta token — mencegah orang lain join
// room dan mencuri QR pairing (QR hijack).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { createWaSocketToken } from '@/lib/wa-socket-token'

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { sessionId } = await params
  try {
    if (!process.env.WA_SERVICE_SECRET) {
      // Fail-closed: tanpa secret, wa-service tidak bisa memverifikasi token.
      return jsonError('WA_SERVICE_SECRET belum dikonfigurasi di server', 503)
    }

    // Pastikan session ini milik user yang login.
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
      select: { id: true },
    })
    if (!wa) return jsonError('Session tidak ditemukan', 404)

    return jsonOk({ token: createWaSocketToken(wa.id) })
  } catch (err) {
    console.error('[GET /api/whatsapp/:id/socket-token] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
