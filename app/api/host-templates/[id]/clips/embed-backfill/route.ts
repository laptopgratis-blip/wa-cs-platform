// POST /api/host-templates/[id]/clips/embed-backfill — backfill embedding untuk
// klip aktif yang belum punya. Idempotent (skip yang sudah punya).
//
// Cost: ~$0.00002 per klip (text-embedding-3-small).

import { Prisma } from '@prisma/client'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { EMBED_MODEL, embedText } from '@/lib/services/clip-library/embed'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { id: true, userId: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }

  // Prisma JSON nullable: pakai Prisma.DbNull untuk match DB NULL.
  // equals: null TIDAK BEKERJA untuk JSONB column → query return empty.
  const clips = await prisma.liveClip.findMany({
    where: {
      hostTemplateId: id,
      isActive: true,
      status: 'READY',
      embedding: { equals: Prisma.DbNull },
    },
    select: { id: true, transcript: true },
  })

  const results: Array<{ clipId: string; ok: boolean; error?: string }> = []
  for (const c of clips) {
    try {
      const vec = await embedText(c.transcript)
      await prisma.liveClip.update({
        where: { id: c.id },
        data: {
          // @ts-expect-error JSON column number[]
          embedding: vec,
          embeddingModel: EMBED_MODEL,
        },
      })
      results.push({ clipId: c.id, ok: true })
    } catch (e) {
      results.push({ clipId: c.id, ok: false, error: (e as Error).message.slice(0, 200) })
    }
  }

  return jsonOk({
    total: clips.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  })
}
