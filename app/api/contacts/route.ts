// GET /api/contacts?stage=NEW&tag=vip&search=&take=&skip=
// List kontak milik user dengan filter & search.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { pipelineEnum } from '@/lib/validations/contact'

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const stage = url.searchParams.get('stage')
  const tag = url.searchParams.get('tag')
  const search = (url.searchParams.get('search') ?? '').trim()
  const take = Math.min(Number(url.searchParams.get('take') ?? 100), 200)
  const skip = Math.max(Number(url.searchParams.get('skip') ?? 0), 0)

  const where: Record<string, unknown> = { userId: session.user.id }
  if (stage) {
    const parsed = pipelineEnum.safeParse(stage)
    if (parsed.success) where.pipelineStage = parsed.data
  }
  if (tag) where.tags = { has: tag }
  if (search) {
    Object.assign(where, {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
      ],
    })
  }

  try {
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where: where as never,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
        select: {
          id: true,
          phoneNumber: true,
          name: true,
          avatar: true,
          tags: true,
          pipelineStage: true,
          isBlacklisted: true,
          aiPaused: true,
          isResolved: true,
          lastMessageAt: true,
          createdAt: true,
        },
      }),
      prisma.contact.count({ where: where as never }),
    ])

    // Tag list unik untuk dropdown filter (max 50 tag teratas).
    const allTags = await prisma.contact.findMany({
      where: { userId: session.user.id },
      select: { tags: true },
      take: 500,
    })
    const tagSet = new Set<string>()
    for (const c of allTags) for (const t of c.tags) tagSet.add(t)

    return jsonOk({
      contacts: contacts.map((c) => ({
        ...c,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      tags: [...tagSet].sort(),
    })
  } catch (err) {
    console.error('[GET /api/contacts] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
