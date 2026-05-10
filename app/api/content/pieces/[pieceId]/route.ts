// GET    /api/content/pieces/[pieceId] — detail piece + slides
// PATCH  /api/content/pieces/[pieceId] — update status (DRAFT|READY|POSTED|ARCHIVED)
//                                       atau body manual edit
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  getPieceForOwner,
  updatePieceStatus,
} from '@/lib/services/content/library'
import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ pieceId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { pieceId } = await params
  const piece = await getPieceForOwner(session.user.id, pieceId)
  if (!piece) return jsonError('Piece tidak ditemukan', 404)
  return jsonOk({ piece })
}

const patchSchema = z.object({
  status: z.enum(['DRAFT', 'READY', 'POSTED', 'ARCHIVED']).optional(),
  bodyJson: z.record(z.string(), z.unknown()).optional(),
  title: z.string().min(1).max(200).optional(),
  // ISO datetime atau null untuk clear schedule.
  scheduledFor: z.string().datetime().nullable().optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { pieceId } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Body tidak valid')

  try {
    if (parsed.data.status) {
      const piece = await updatePieceStatus(
        session.user.id,
        pieceId,
        parsed.data.status,
      )
      return jsonOk({ piece })
    }
    if (
      parsed.data.bodyJson ||
      parsed.data.title ||
      parsed.data.scheduledFor !== undefined
    ) {
      const result = await prisma.contentPiece.updateMany({
        where: { id: pieceId, userId: session.user.id },
        data: {
          ...(parsed.data.bodyJson && {
            bodyJson: parsed.data.bodyJson as object,
          }),
          ...(parsed.data.title && { title: parsed.data.title }),
          ...(parsed.data.scheduledFor !== undefined && {
            scheduledFor: parsed.data.scheduledFor
              ? new Date(parsed.data.scheduledFor)
              : null,
          }),
        },
      })
      if (result.count === 0) return jsonError('Piece tidak ditemukan', 404)
      const piece = await prisma.contentPiece.findUnique({
        where: { id: pieceId },
      })
      return jsonOk({ piece })
    }
    return jsonError('Tidak ada perubahan')
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Gagal update', 400)
  }
}
