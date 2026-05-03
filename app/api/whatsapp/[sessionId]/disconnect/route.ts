// POST /api/whatsapp/[sessionId]/disconnect
// Disconnect via wa-service + update DB. Body opsional: { wipe?: boolean }
// Kalau wipe=true → logout permanen (credentials Baileys dihapus).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function POST(req: Request, { params }: Params) {
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
      select: { id: true },
    })
    if (!wa) return jsonError('Session tidak ditemukan', 404)

    const body = (await req.json().catch(() => ({}))) as { wipe?: boolean }
    const wipe = Boolean(body.wipe)

    const svc = await waService.disconnect(sessionId, wipe)
    if (!svc.success) {
      return jsonError(svc.error || 'wa-service gagal merespons', 502)
    }

    if (wipe) {
      // Hapus credentials sudah di-handle wa-service. Tandai session sebagai
      // tidak aktif di DB supaya tidak muncul di list, tapi log tetap ada.
      await prisma.whatsappSession.update({
        where: { id: sessionId },
        data: { status: 'DISCONNECTED', isActive: false, sessionData: null },
      })
    } else {
      await prisma.whatsappSession.update({
        where: { id: sessionId },
        data: { status: 'DISCONNECTED' },
      })
    }

    return jsonOk({ id: sessionId, wiped: wipe })
  } catch (err) {
    console.error('[POST /api/whatsapp/:id/disconnect] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
