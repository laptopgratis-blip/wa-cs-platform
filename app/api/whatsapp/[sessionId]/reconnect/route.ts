// POST /api/whatsapp/[sessionId]/reconnect
// Wipe credentials lama di wa-service + reconnect ulang. Row DB tetap ada
// (hanya status reset ke CONNECTING). Dipakai saat user mau scan QR baru
// untuk session yang sudah ke-kick / disconnect.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { sessionId } = await params
  try {
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: sessionId, userId: session.user.id },
      select: { id: true, isActive: true },
    })
    if (!wa) return jsonError('Session tidak ditemukan', 404)

    // 1. Wipe credentials lama (kalau ada) — abaikan error karena mungkin
    //    session sudah tidak in-memory di wa-service.
    await waService.disconnect(sessionId, true).catch(() => {})

    // 2. Pastikan row DB aktif lagi (kalau tadi di-soft delete via wipe).
    await prisma.whatsappSession.update({
      where: { id: sessionId },
      data: {
        isActive: true,
        status: 'CONNECTING',
        phoneNumber: null,
        displayName: null,
        sessionData: null,
      },
    })

    // 3. Trigger connect baru di wa-service — ini akan generate QR fresh.
    const svc = await waService.connect(sessionId)
    if (!svc.success) {
      return jsonError(svc.error || 'wa-service gagal merespons', 502)
    }

    return jsonOk({
      id: sessionId,
      status: svc.data?.status ?? 'CONNECTING',
    })
  } catch (err) {
    console.error('[POST /api/whatsapp/:id/reconnect] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
