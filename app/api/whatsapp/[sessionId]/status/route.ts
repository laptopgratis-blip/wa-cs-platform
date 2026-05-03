// GET /api/whatsapp/[sessionId]/status
// Ambil status terkini dari wa-service, sinkronkan ke DB, lalu return.
// Dipanggil frontend tiap kali dapat event Socket.io supaya DB ikut update.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

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
    // Pastikan session ini milik user yang login.
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
      select: { id: true, status: true, phoneNumber: true, displayName: true },
    })
    if (!wa) return jsonError('Session tidak ditemukan', 404)

    const svc = await waService.status(sessionId)
    if (!svc.success || !svc.data) {
      // Tidak fatal — kembalikan data DB saja.
      return jsonOk({
        id: wa.id,
        status: wa.status,
        phoneNumber: wa.phoneNumber,
        displayName: wa.displayName,
        qrDataUrl: null as string | null,
      })
    }

    const live = svc.data
    const needsUpdate =
      live.status !== wa.status ||
      live.phoneNumber !== wa.phoneNumber ||
      live.displayName !== wa.displayName
    if (needsUpdate) {
      await prisma.whatsappSession.update({
        where: { id: wa.id },
        data: {
          status: live.status,
          phoneNumber: live.phoneNumber,
          displayName: live.displayName,
        },
      })
    }

    return jsonOk({
      id: wa.id,
      status: live.status,
      phoneNumber: live.phoneNumber,
      displayName: live.displayName,
      qrDataUrl: live.qrDataUrl,
    })
  } catch (err) {
    console.error('[GET /api/whatsapp/:id/status] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
