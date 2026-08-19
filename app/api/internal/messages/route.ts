// POST /api/internal/messages
// Simpan satu pesan masuk/keluar. Auto-create Contact kalau belum ada.
// Juga return contact + last 10 messages supaya wa-service tidak perlu hit API
// lagi untuk dapat history.
//
// Wrapper tipis di atas lib/services/cs-pipeline/message-store — logika
// dipakai bersama dengan webhook Cloud API (tanpa HTTP).
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import {
  isDuplicateExternalMessageError,
  saveMessage,
} from '@/lib/services/cs-pipeline/message-store'

const bodySchema = z.object({
  sessionId: z.string().min(1),
  phoneNumber: z.string().min(1), // nomor lawan bicara (tanpa @s.whatsapp.net)
  pushName: z.string().nullish(),
  content: z.string().min(1),
  role: z.enum(['USER', 'AI', 'HUMAN', 'AGENT']),
  tokensUsed: z.number().int().nonnegative().optional(),
  // Kalau true: setelah simpan, ambil 10 pesan terakhir untuk konteks AI.
  withHistory: z.boolean().optional(),
  // Asal pesan AGENT/AI — null/absent untuk pesan customer.
  source: z.enum(['WA_DIRECT', 'WEB_DASHBOARD', 'AI']).optional(),
  // ID pesan dari Baileys (msg.key.id) — untuk dedup outgoing message.
  externalMsgId: z.string().nullish(),
  // Status pengiriman pesan keluar. Absent → default DB (SENT). 'FAILED' untuk
  // balasan AI yang gagal terkirim ke WhatsApp.
  status: z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED']).optional(),
  // Profitability tracking — di-set untuk pesan AI. Optional (legacy /
  // pesan customer biarkan null di DB).
  apiInputTokens: z.number().int().nonnegative().optional(),
  apiOutputTokens: z.number().int().nonnegative().optional(),
  apiCostRp: z.number().nonnegative().optional(),
  tokensCharged: z.number().int().nonnegative().optional(),
  revenueRp: z.number().nonnegative().optional(),
  profitRp: z.number().optional(), // boleh negatif (= rugi)
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
    const result = await saveMessage({
      ...body,
      externalMsgId: body.externalMsgId ?? null,
    })
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'session tidak ditemukan' },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        messageId: result.messageId,
        contactId: result.contactId,
        contact: result.contact,
        history: result.history,
      },
    })
  } catch (err) {
    // externalMsgId unique: pesan yang sama sudah tersimpan (echo/retry).
    // 409 supaya wa-service memperlakukannya sebagai skip, bukan gagal.
    if (isDuplicateExternalMessageError(err)) {
      return NextResponse.json(
        { success: false, error: 'duplicate', externalMsgId: err.externalMsgId },
        { status: 409 },
      )
    }
    console.error('[POST /api/internal/messages] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
