// GET /api/content/library?channel=&funnelStage=&status=&briefId=&pieceType=
// List ContentPiece milik user dgn filter optional.
import type { NextResponse } from 'next/server'

import { jsonOk, requireSession } from '@/lib/api'
import { listPiecesForOwner } from '@/lib/services/content/library'

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const url = new URL(req.url)
  const pieces = await listPiecesForOwner(session.user.id, {
    channel: url.searchParams.get('channel') ?? undefined,
    funnelStage: url.searchParams.get('funnelStage') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    briefId: url.searchParams.get('briefId') ?? undefined,
    pieceType: url.searchParams.get('pieceType') ?? undefined,
  })
  return jsonOk({ pieces })
}
