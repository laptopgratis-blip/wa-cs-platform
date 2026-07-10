// GET /api/internal/whatsapp/restorable
// Daftar id session yang layak di-restore wa-service saat boot: hanya yang
// terakhir tercatat CONNECTED/PAUSED di DB. Ratusan folder credential sesi
// mati (DISCONNECTED/ERROR) ikut di-restore dulunya → reconnect-storm 408 +
// heap OOM (insiden 2026-07-05).
import { NextResponse } from 'next/server'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  try {
    const sessions = await prisma.whatsappSession.findMany({
      where: { status: { in: ['CONNECTED', 'PAUSED'] } },
      select: { id: true },
    })
    return NextResponse.json({
      success: true,
      data: { ids: sessions.map((s) => s.id) },
    })
  } catch (err) {
    console.error('[GET /api/internal/whatsapp/restorable] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 },
    )
  }
}
