// POST /api/inbox/[contactId]/takeover
// Body: { paused: boolean }. Toggle aiPaused — ON = CS ambil alih, AI mati.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({ paused: z.boolean() })

interface Params {
  params: Promise<{ contactId: string }>
}

export async function POST(req: Request, { params }: Params) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { contactId } = await params

  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return jsonError('Body tidak valid')

  try {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: session.user.id },
      select: { id: true },
    })
    if (!contact) return jsonError('Kontak tidak ditemukan', 404)

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { aiPaused: parsed.data.paused },
      select: { id: true, aiPaused: true },
    })
    return jsonOk(updated)
  } catch (err) {
    console.error('[POST /api/inbox/:id/takeover] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
