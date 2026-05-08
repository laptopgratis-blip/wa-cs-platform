// POST /api/internal/followup-stop-check
// Body: { sessionId, phoneNumber, content }
// Auth: x-service-secret header.
// Response: { success: true, data: { isStop: boolean, autoReply?: string } }
//
// Dipakai wa-service saat pesan masuk dari customer (handleIncomingMessage).
// Tugasnya:
//   1. Cek apakah content match keyword STOP/BERHENTI/dll
//   2. Kalau match: lookup userId via session, upsert FollowUpBlacklist,
//      cancel pending queue untuk customer ini
//   3. Return { isStop: true, autoReply } supaya wa-service kirim auto-reply
//      via Baileys dan stop processing pesan ini (tidak trigger flow / AI).
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'
import { cancelQueueForCustomer } from '@/lib/services/followup-engine'

const bodySchema = z.object({
  sessionId: z.string().min(1),
  phoneNumber: z.string().min(1),
  content: z.string(),
})

// Keyword yang trigger stop. Match: case-insensitive, exact match atau
// keyword di awal pesan (mis. "STOP. tolong jangan ganggu lagi"). Tidak match
// di tengah pesan supaya "PRODUKNYA STOP DI JNE" tidak trigger.
const STOP_KEYWORDS = [
  'stop',
  'berhenti',
  'jangan kirim',
  'unsubscribe',
  'jangan ganggu',
  'hentikan',
] as const

const AUTO_REPLY =
  'Baik kak, kami tidak akan kirim pesan otomatis lagi. Terima kasih 🙏'

function detectStopKeyword(content: string): string | null {
  const text = content.toLowerCase().trim()
  if (!text) return null
  for (const kw of STOP_KEYWORDS) {
    if (text === kw) return kw
    if (text.startsWith(kw + ' ')) return kw
    if (text.startsWith(kw + '.')) return kw
    if (text.startsWith(kw + ',')) return kw
    if (text.startsWith(kw + '!')) return kw
  }
  return null
}

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
      data: { isStop: true, autoReply: AUTO_REPLY },
    })
  }

  // Normalisasi phone — sama format yang dipakai saat queue dibuat.
  // Customer phone biasanya udah 62xxx tanpa @s.whatsapp.net.
  const customerPhone = body.phoneNumber.split('@')[0].replace(/^\+/, '')

  try {
    await prisma.followUpBlacklist.upsert({
      where: {
        userId_customerPhone: { userId: session.userId, customerPhone },
      },
      create: {
        userId: session.userId,
        customerPhone,
        reason: `Customer replied "${matched}": ${body.content.substring(0, 100)}`,
      },
      update: {
        reason: `Customer replied "${matched}": ${body.content.substring(0, 100)}`,
      },
    })

    await cancelQueueForCustomer(
      session.userId,
      customerPhone,
      `Stop keyword: ${matched}`,
    )
  } catch (err) {
    console.error('[followup-stop-check] gagal upsert blacklist:', err)
  }

  return NextResponse.json({
    success: true,
    data: { isStop: true, autoReply: AUTO_REPLY },
  })
}
