// POST /api/internal/messages/status
// Update status pengiriman pesan berdasarkan externalMsgId (msg.key.id Baileys).
// Dipanggil wa-service saat ada ack error/sukses → status pesan berubah
// (mis. jadi FAILED) supaya inbox bisa di-update realtime.
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import { emitWebhookEvent } from '@/lib/services/webhooks/dispatch'

const bodySchema = z.object({
  externalMsgId: z.string().min(1),
  status: z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED']),
})

export async function POST(req: Request) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  let body: z.infer<typeof bodySchema>
  try {
    const json = await req.json()
    body = bodySchema.parse(json)
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 400 },
    )
  }

  try {
    // updateMany: 0..n baris bisa cocok (externalMsgId tidak dijamin unik).
    const r = await prisma.message.updateMany({
      where: { externalMsgId: body.externalMsgId },
      data: { status: body.status },
    })

    // Webhook keluar seller. Message tidak punya userId — ambil lewat
    // relasi kontak dari salah satu baris yang barusan berubah.
    if (r.count > 0) {
      const msg = await prisma.message.findFirst({
        where: { externalMsgId: body.externalMsgId },
        select: { waSessionId: true, contact: { select: { userId: true } } },
      })
      if (msg) {
        emitWebhookEvent({
          userId: msg.contact.userId,
          type: 'message.status.updated',
          data: { externalMsgId: body.externalMsgId, status: body.status, sessionId: msg.waSessionId },
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: { updated: r.count },
    })
  } catch (err) {
    console.error('[POST /api/internal/messages/status] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
