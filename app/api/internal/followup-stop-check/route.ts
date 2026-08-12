// POST /api/internal/followup-stop-check
// Body: { sessionId, phoneNumber, content }
// Auth: x-service-secret header.
// Response: { success: true, data: { isStop: boolean, autoReply?: string } }
//
// Dipakai wa-service saat pesan masuk dari customer (handleIncomingMessage).
// Wrapper tipis di atas lib/services/followup-stop — logika dipakai bersama
// dengan webhook Cloud API (tanpa HTTP).
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import {
  applyFollowupStop,
  detectStopKeyword,
  STOP_AUTO_REPLY,
} from '@/lib/services/followup-stop'

const bodySchema = z.object({
  sessionId: z.string().min(1),
  phoneNumber: z.string().min(1),
  content: z.string(),
})

export async function POST(req: Request) {
  const blocked = requireServiceSecret(req)
  if (blocked) return blocked

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid body' },
      { status: 400 },
    )
  }

  const matched = detectStopKeyword(body.content)
  if (!matched) {
    return NextResponse.json({ success: true, data: { isStop: false } })
  }

  // Lookup userId dari sessionId.
  const session = await prisma.whatsappSession.findUnique({
    where: { id: body.sessionId },
    select: { userId: true },
  })
  if (!session) {
    // Tidak ada session → tidak bisa blacklist; tapi tetap return isStop=true
    // supaya wa-service tidak terus proses (consistent dengan intent user).
    return NextResponse.json({
      success: true,
      data: { isStop: true, autoReply: STOP_AUTO_REPLY },
    })
  }

  await applyFollowupStop({
    userId: session.userId,
    phoneNumber: body.phoneNumber,
    content: body.content,
    matched,
  })

  return NextResponse.json({
    success: true,
    data: { isStop: true, autoReply: STOP_AUTO_REPLY },
  })
}
