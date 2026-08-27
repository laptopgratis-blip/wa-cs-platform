// POST /api/broadcast/[broadcastId]/send
// Jalankan (atau lanjutkan, Cloud API PAUSED) broadcast — logika di
// lib/services/broadcast/start.ts (Baileys: wa-service loop; Cloud API:
// BroadcastRecipient + batch template).
import { NextResponse } from 'next/server'

import { jsonOk, requireSession } from '@/lib/api'
import { startBroadcast } from '@/lib/services/broadcast/start'

interface Params {
  params: Promise<{ broadcastId: string }>
}

export async function POST(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { broadcastId } = await params

  try {
    const r = await startBroadcast(broadcastId, { userId: session.user.id, trigger: 'user' })
    if (!r.ok) {
      return NextResponse.json({ success: false, error: r.error }, { status: r.httpStatus ?? 400 })
    }
    return jsonOk({ id: broadcastId, status: r.status, totalTargets: r.totalTargets, estimatedCreditRp: r.estimatedCreditRp ?? 0 })
  } catch (err) {
    console.error('[POST /api/broadcast/:id/send] gagal:', err)
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 })
  }
}
