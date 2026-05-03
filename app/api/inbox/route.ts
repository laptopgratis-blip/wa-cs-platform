// GET /api/inbox?filter=all|ai|attention|resolved&search=...
// List percakapan (= kontak) milik user dengan ringkasan pesan terakhir.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const filterEnum = z.enum(['all', 'ai', 'attention', 'resolved']).default('all')

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const filter = filterEnum.parse(url.searchParams.get('filter') ?? 'all')
  const search = (url.searchParams.get('search') ?? '').trim()

  // Susun where clause sesuai filter.
  const where: Record<string, unknown> = {
    userId: session.user.id,
    // Hanya kontak yang punya pesan supaya inbox tidak penuh kontak baru kosong.
    messages: { some: {} },
  }
  if (filter === 'ai') Object.assign(where, { aiPaused: false, isResolved: false })
  if (filter === 'attention') Object.assign(where, { aiPaused: true, isResolved: false })
  if (filter === 'resolved') Object.assign(where, { isResolved: true })
  if (search) {
    Object.assign(where, {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
      ],
    })
  }

  try {
    const contacts = await prisma.contact.findMany({
      where: where as never,
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        avatar: true,
        tags: true,
        pipelineStage: true,
        aiPaused: true,
        isResolved: true,
        lastMessageAt: true,
        waSession: { select: { id: true, displayName: true, phoneNumber: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    })

    const data = contacts.map((c) => ({
      id: c.id,
      phoneNumber: c.phoneNumber,
      name: c.name,
      avatar: c.avatar,
      tags: c.tags,
      pipelineStage: c.pipelineStage,
      aiPaused: c.aiPaused,
      isResolved: c.isResolved,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      waSession: c.waSession,
      lastMessage: c.messages[0]
        ? {
            content: c.messages[0].content,
            role: c.messages[0].role,
            createdAt: c.messages[0].createdAt.toISOString(),
          }
        : null,
    }))

    // Counter per filter — supaya UI bisa tampilkan badge tab tanpa fetch ulang.
    const [allCount, aiCount, attentionCount, resolvedCount] = await Promise.all([
      prisma.contact.count({
        where: { userId: session.user.id, messages: { some: {} } },
      }),
      prisma.contact.count({
        where: {
          userId: session.user.id,
          messages: { some: {} },
          aiPaused: false,
          isResolved: false,
        },
      }),
      prisma.contact.count({
        where: {
          userId: session.user.id,
          messages: { some: {} },
          aiPaused: true,
          isResolved: false,
        },
      }),
      prisma.contact.count({
        where: { userId: session.user.id, messages: { some: {} }, isResolved: true },
      }),
    ])

    return jsonOk({
      conversations: data,
      counts: {
        all: allCount,
        ai: aiCount,
        attention: attentionCount,
        resolved: resolvedCount,
      },
    })
  } catch (err) {
    console.error('[GET /api/inbox] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
