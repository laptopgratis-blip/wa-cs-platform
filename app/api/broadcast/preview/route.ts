// GET /api/broadcast/preview?waSessionId=...&tags=a,b&stages=NEW,PROSPECT
// Hitung jumlah kontak yang akan menerima broadcast — dipakai form untuk
// preview "Akan dikirim ke X kontak".
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { buildTargetWhere } from '@/lib/broadcast'
import { prisma } from '@/lib/prisma'

const VALID_STAGES = [
  'NEW',
  'PROSPECT',
  'INTEREST',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const

type Stage = (typeof VALID_STAGES)[number]

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const waSessionId = url.searchParams.get('waSessionId')
  if (!waSessionId) return jsonError('waSessionId wajib')

  const tags = (url.searchParams.get('tags') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const stages = (url.searchParams.get('stages') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Stage => (VALID_STAGES as readonly string[]).includes(s))

  try {
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: waSessionId, userId: session.user.id },
      select: { id: true },
    })
    if (!wa) return jsonError('WhatsApp session tidak ditemukan', 404)

    if (tags.length === 0 && stages.length === 0) {
      return jsonOk({ count: 0 })
    }

    const count = await prisma.contact.count({
      where: buildTargetWhere({
        userId: session.user.id,
        waSessionId,
        tags,
        stages,
      }) as never,
    })

    return jsonOk({ count })
  } catch (err) {
    console.error('[GET /api/broadcast/preview] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
