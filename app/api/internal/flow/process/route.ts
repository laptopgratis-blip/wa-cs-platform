// POST /api/internal/flow/process
// Dipanggil wa-service tiap pesan masuk (sebelum AI generation).
// Body: { sessionId, contactId, message }
// Response: { handled, reply?, notifyAdmin?, meta? } — lihat FlowProcessResult
// di lib/services/flow-engine.ts.
//
// Kalau handled=true, wa-service kirim `reply` ke customer dan SKIP AI.
// Kalau ada notifyAdmin, wa-service kirim notifikasi ke admin via session
// WA yang sama.
import { NextResponse } from 'next/server'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import { processFlowMessage } from '@/lib/services/flow-engine'

export async function POST(req: Request) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const body = (await req.json().catch(() => null)) as {
    sessionId?: unknown
    contactId?: unknown
    message?: unknown
  } | null

  const sessionId =
    body && typeof body.sessionId === 'string' ? body.sessionId : ''
  const contactId =
    body && typeof body.contactId === 'string' ? body.contactId : ''
  const message =
    body && typeof body.message === 'string' ? body.message : ''

  if (!sessionId || !contactId || !message) {
    return NextResponse.json(
      { success: false, error: 'sessionId, contactId, message wajib' },
      { status: 400 },
    )
  }

  try {
    // Resolve userId dari sessionId (pakai pattern yang sama dengan internal
    // routes lain). Kalau session tidak ditemukan, bukan error 500 —
    // kembalikan handled=false supaya wa-service lanjut ke AI.
    const wa = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    })
    if (!wa) {
      return NextResponse.json({
        success: true,
        data: { handled: false },
      })
    }

    const result = await processFlowMessage({
      userId: wa.userId,
      contactId,
      message,
    })
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('[POST /api/internal/flow/process] gagal:', err)
    // Penting: kalau flow engine error, fallback ke AI normal — jangan
    // memutus chat karena masalah internal.
    return NextResponse.json({
      success: true,
      data: { handled: false },
    })
  }
}
