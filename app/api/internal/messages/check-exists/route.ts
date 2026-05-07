// POST /api/internal/messages/check-exists
// Body: { externalMsgId: string, sessionId: string }
// Auth: x-service-secret header.
// Response: { success: true, data: { exists: boolean } }
//
// Dipakai wa-service saat event messages.upsert masuk dengan fromMe=true —
// untuk dedup pesan yang sudah disimpan saat kirim via API web.
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  externalMsgId: z.string().min(1),
  sessionId: z.string().min(1),
})

export async function POST(req: Request) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 400 },
    )
  }

  try {
    const message = await prisma.message.findFirst({
      where: {
        externalMsgId: body.externalMsgId,
        waSessionId: body.sessionId,
      },
      select: { id: true },
    })
    return NextResponse.json({
      success: true,
      data: { exists: Boolean(message) },
    })
  } catch (err) {
    console.error('[POST /api/internal/messages/check-exists] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
