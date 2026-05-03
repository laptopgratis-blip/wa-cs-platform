// POST /api/whatsapp/connect
// Buat WhatsappSession baru (atau pakai yang DISCONNECTED milik user),
// lalu trigger wa-service untuk mulai sesi.
import { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

export async function POST() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const wa = await prisma.whatsappSession.create({
      data: {
        userId: session.user.id,
        status: 'CONNECTING',
        isActive: true,
      },
      select: { id: true, status: true, createdAt: true },
    })

    const svc = await waService.connect(wa.id)
    if (!svc.success) {
      // Rollback: hapus row supaya user tidak punya session zombie.
      await prisma.whatsappSession.delete({ where: { id: wa.id } }).catch(() => {})
      return jsonError(svc.error || 'wa-service gagal merespons', 502)
    }

    // Sinkronkan status awal dari wa-service (kemungkinan masih CONNECTING).
    if (svc.data && svc.data.status !== wa.status) {
      await prisma.whatsappSession.update({
        where: { id: wa.id },
        data: { status: svc.data.status },
      })
    }

    return jsonOk({ id: wa.id, status: svc.data?.status ?? 'CONNECTING' }, 201)
  } catch (err) {
    console.error('[POST /api/whatsapp/connect] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
