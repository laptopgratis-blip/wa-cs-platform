// POST /api/internal/contacts/status
// Body: { sessionId: string, phoneNumber: string }
// Auth: x-service-secret header.
// Response: { success: true, data: { aiPaused, contactId } | null }
//
// Dipakai wa-service saat event fromMe masuk — untuk cek apakah kontak sedang
// dalam mode takeover (CS aktif balas manual). Kalau iya, simpan pesan
// outgoing sebagai AGENT/WA_DIRECT supaya inbox web tetap utuh.
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  sessionId: z.string().min(1),
  phoneNumber: z.string().min(1),
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
    // Resolve userId dari sessionId, lalu cari kontak by userId+phoneNumber
    // (sama logika dengan /api/internal/messages — kontak unik per user, bukan
    // per session, supaya pindah session tidak bikin duplikat).
    const wa = await prisma.whatsappSession.findUnique({
      where: { id: body.sessionId },
      select: { userId: true },
    })
    if (!wa) {
      return NextResponse.json({ success: true, data: null })
    }

    const contact = await prisma.contact.findFirst({
      where: { userId: wa.userId, phoneNumber: body.phoneNumber },
      select: { id: true, aiPaused: true },
    })
    if (!contact) {
      return NextResponse.json({ success: true, data: null })
    }

    return NextResponse.json({
      success: true,
      data: { contactId: contact.id, aiPaused: contact.aiPaused },
    })
  } catch (err) {
    console.error('[POST /api/internal/contacts/status] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
