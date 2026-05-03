// GET    /api/contacts/[contactId] — detail + 20 pesan terakhir
// PATCH  /api/contacts/[contactId] — update name/notes/stage/tags/blacklist
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { contactUpdateSchema } from '@/lib/validations/contact'

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
        pipelineStage: true,
        notes: true,
        isBlacklisted: true,
        aiPaused: true,
        isResolved: true,
        lastMessageAt: true,
        createdAt: true,
        waSession: { select: { id: true, displayName: true, status: true } },
      },
    })
    if (!contact) return jsonError('Kontak tidak ditemukan', 404)

    const messages = await prisma.message.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, content: true, role: true, createdAt: true },
    })

    return jsonOk({
      ...contact,
      lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
      createdAt: contact.createdAt.toISOString(),
      messages: messages.reverse().map((m) => ({
        id: m.id,
        content: m.content,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[GET /api/contacts/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { contactId } = await params
  const parsed = contactUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: session.user.id },
      select: { id: true },
    })
    if (!contact) return jsonError('Kontak tidak ditemukan', 404)

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        notes: true,
        tags: true,
        pipelineStage: true,
        isBlacklisted: true,
      },
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[PATCH /api/contacts/:id] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
