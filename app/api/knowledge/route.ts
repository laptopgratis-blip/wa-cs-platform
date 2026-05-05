// GET  /api/knowledge — list semua entry pengetahuan milik user.
// POST /api/knowledge — buat entry baru. Limit 30 per user (KNOWLEDGE_LIMIT_PER_USER).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  KNOWLEDGE_LIMIT_PER_USER,
  knowledgeCreateSchema,
} from '@/lib/validations/knowledge'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const items = await prisma.userKnowledge.findMany({
      where: { userId: session.user.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        contentType: true,
        textContent: true,
        fileUrl: true,
        linkUrl: true,
        caption: true,
        triggerKeywords: true,
        isActive: true,
        triggerCount: true,
        lastTriggeredAt: true,
        order: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return jsonOk({
      items: items.map((it) => ({
        ...it,
        lastTriggeredAt: it.lastTriggeredAt?.toISOString() ?? null,
        createdAt: it.createdAt.toISOString(),
        updatedAt: it.updatedAt.toISOString(),
      })),
      limit: KNOWLEDGE_LIMIT_PER_USER,
      used: items.length,
    })
  } catch (err) {
    console.error('[GET /api/knowledge] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const json = await req.json().catch(() => null)
  const parsed = knowledgeCreateSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    // Enforce limit per user. Cek count duluan supaya pesan error jelas
    // ("sudah penuh") bukan generic 500.
    const count = await prisma.userKnowledge.count({
      where: { userId: session.user.id },
    })
    if (count >= KNOWLEDGE_LIMIT_PER_USER) {
      return jsonError(
        `Sudah mencapai batas ${KNOWLEDGE_LIMIT_PER_USER} entry. Hapus yang lama dulu untuk menambah baru.`,
        409,
      )
    }

    const data = parsed.data
    const created = await prisma.userKnowledge.create({
      data: {
        userId: session.user.id,
        title: data.title,
        contentType: data.contentType,
        textContent: data.contentType === 'TEXT' ? data.textContent : null,
        fileUrl:
          data.contentType === 'IMAGE' || data.contentType === 'FILE'
            ? data.fileUrl
            : null,
        linkUrl: data.contentType === 'LINK' ? data.linkUrl : null,
        caption: data.caption ?? null,
        triggerKeywords: data.triggerKeywords ?? [],
        isActive: data.isActive ?? true,
        order: data.order ?? 0,
      },
    })
    return jsonOk(
      {
        ...created,
        lastTriggeredAt: created.lastTriggeredAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/knowledge] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
