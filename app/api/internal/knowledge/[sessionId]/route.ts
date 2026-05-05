// POST /api/internal/knowledge/[sessionId]
// Dipanggil wa-service tiap pesan masuk untuk dapat knowledge entries yang
// match keyword di pesan customer. Body: { message: string }.
//
// Side-effect: kalau ada match, increment triggerCount + lastTriggeredAt
// supaya counter di UI dashboard up-to-date.
import { NextResponse } from 'next/server'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import {
  formatKnowledgeForPrompt,
  incrementTriggerCount,
  retrieveRelevantKnowledge,
} from '@/lib/services/knowledge-retriever'

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
  const message =
    body && typeof body.message === 'string' ? body.message : ''

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

    const items = await retrieveRelevantKnowledge(wa.userId, message)
    const promptBlock = formatKnowledgeForPrompt(items)

    // Best-effort increment — tidak menahan response.
    if (items.length > 0) {
      void incrementTriggerCount(items.map((it) => it.id))
    }

    return NextResponse.json({
      success: true,
      data: { items, promptBlock },
    })
  } catch (err) {
    console.error('[POST /api/internal/knowledge/:sessionId] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
