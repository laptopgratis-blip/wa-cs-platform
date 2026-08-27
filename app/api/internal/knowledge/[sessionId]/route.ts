// POST /api/internal/knowledge/[sessionId]
// Dipanggil wa-service tiap pesan masuk untuk dapat knowledge entries yang
// match keyword di pesan customer. Body: { message: string }.
//
// Wrapper tipis di atas lib/services/cs-pipeline/knowledge — logika dipakai
// bersama dengan webhook Cloud API (tanpa HTTP). Detail komposisi promptBlock
// (waktu, bank, katalog, ongkir, rules) ada di lib tersebut.
import { NextResponse } from 'next/server'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import { getKnowledgeForMessage } from '@/lib/services/cs-pipeline/knowledge'

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function POST(req: Request, { params }: Params) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const { sessionId } = await params

  const body = (await req.json().catch(() => null)) as
    | { message?: unknown }
    | null
  const message = body && typeof body.message === 'string' ? body.message : ''

  try {
    // Resolve userId dari sessionId — wa-service hanya tahu sessionId.
    const wa = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    })
    if (!wa) {
      return NextResponse.json(
        { success: false, error: 'session tidak ditemukan' },
        { status: 404 },
      )
    }

    const result = await getKnowledgeForMessage(wa.userId, message)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('[POST /api/internal/knowledge/:sessionId] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
