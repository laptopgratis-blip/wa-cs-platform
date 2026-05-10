// GET /api/content/brief/[briefId] — detail brief + linked pieces
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { getBriefForOwner } from '@/lib/services/content/brief'

interface Params {
  params: Promise<{ briefId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { briefId } = await params
  const brief = await getBriefForOwner(session.user.id, briefId)
  if (!brief) return jsonError('Brief tidak ditemukan', 404)
  return jsonOk({ brief })
}
