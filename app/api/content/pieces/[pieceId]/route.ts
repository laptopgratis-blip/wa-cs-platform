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
  // Phase 5 — metric input (semua optional, null = clear).
  reach: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  impressions: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  saves: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  shares: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  comments: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  dms: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  linkClicks: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
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
    const metricKeys = [
      'reach',
      'impressions',
      'saves',
      'shares',
      'comments',
      'dms',
      'linkClicks',
    ] as const
    const metricChanges: Record<string, number | null> = {}
    let hasMetricChange = false
    for (const k of metricKeys) {
      if (parsed.data[k] !== undefined) {
        metricChanges[k] = parsed.data[k]
        hasMetricChange = true
      }
    }

    if (
      parsed.data.bodyJson ||
      parsed.data.title ||
      parsed.data.scheduledFor !== undefined ||
      hasMetricChange
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
          ...metricChanges,
          ...(hasMetricChange && { metricUpdatedAt: new Date() }),
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
