// GET /api/inbox/[contactId]/messages
// Ambil history pesan satu kontak (urut kronologis untuk tampilan chat).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ contactId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const { contactId } = await params
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: session.user.id },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        avatar: true,
        tags: true,
        notes: true,
        pipelineStage: true,
        aiPaused: true,
        isResolved: true,
        lastMessageAt: true,
        waSession: { select: { id: true, displayName: true, status: true } },
      },
    })
    if (!contact) return jsonError('Kontak tidak ditemukan', 404)

    const messages = await prisma.message.findMany({
      where: { contactId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        content: true,
        role: true,
        status: true,
        createdAt: true,
      },
    })

    return jsonOk({
      contact: {
        ...contact,
        lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
      },
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        role: m.role,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/inbox/:id/messages] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
