// GET /api/internal/soul/[sessionId]
// Dipanggil wa-service untuk dapat soul + model + userId untuk satu WA session.
// Kembalikan systemPrompt yang sudah di-build supaya wa-service tinggal pakai.
//
// Wrapper tipis di atas lib/services/cs-pipeline/session-config — logika
// dipakai bersama dengan webhook Cloud API (tanpa HTTP).
import { NextResponse } from 'next/server'

import { requireServiceSecret } from '@/lib/internal-auth'
import { getSessionAiConfig } from '@/lib/services/cs-pipeline/session-config'

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function GET(req: Request, { params }: Params) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const { sessionId } = await params
  try {
    const cfg = await getSessionAiConfig(sessionId)
    if (!cfg) {
      return NextResponse.json(
        { success: false, error: 'session tidak ditemukan' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true, data: cfg })
  } catch (err) {
    console.error('[GET /api/internal/soul/:sessionId] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
