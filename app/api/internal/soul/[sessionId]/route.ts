// GET /api/internal/soul/[sessionId]
// Dipanggil wa-service untuk dapat soul + model + userId untuk satu WA session.
// Kembalikan systemPrompt yang sudah di-build supaya wa-service tinggal pakai.
import { NextResponse } from 'next/server'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import { buildSystemPrompt, type Language, type Personality, type ReplyStyle } from '@/lib/soul'

interface Params {
  params: Promise<{ sessionId: string }>
}

export async function GET(req: Request, { params }: Params) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  const { sessionId } = await params
  try {
    const wa = await prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        soul: true,
        model: { select: { id: true, modelId: true, provider: true, costPerMessage: true, isActive: true } },
      },
    })

    if (!wa) {
      return NextResponse.json(
        { success: false, error: 'session tidak ditemukan' },
        { status: 404 },
      )
    }

    // Bangun system prompt dari config soul (kalau ada).
    const systemPrompt = wa.soul
      ? buildSystemPrompt({
          name: wa.soul.name,
          personality: wa.soul.personality as Personality | null,
          language: (wa.soul.language || 'id') as Language,
          replyStyle: wa.soul.replyStyle as ReplyStyle | null,
          businessContext: wa.soul.businessContext,
        })
      : null

    return NextResponse.json({
      success: true,
      data: {
        sessionId: wa.id,
        userId: wa.userId,
        soul: wa.soul
          ? {
              id: wa.soul.id,
              name: wa.soul.name,
              language: wa.soul.language,
              systemPrompt,
            }
          : null,
        model: wa.model,
      },
    })
  } catch (err) {
    console.error('[GET /api/internal/soul/:sessionId] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
