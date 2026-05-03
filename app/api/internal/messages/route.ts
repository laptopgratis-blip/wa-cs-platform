// POST /api/internal/messages
// Simpan satu pesan masuk/keluar. Auto-create Contact kalau belum ada.
// Juga return contact + last 10 messages supaya wa-service tidak perlu hit API
// lagi untuk dapat history.
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireServiceSecret } from '@/lib/internal-auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  sessionId: z.string().min(1),
  phoneNumber: z.string().min(1), // nomor lawan bicara (tanpa @s.whatsapp.net)
  pushName: z.string().nullish(),
  content: z.string().min(1),
  role: z.enum(['USER', 'AI', 'HUMAN']),
  tokensUsed: z.number().int().nonnegative().optional(),
  // Kalau true: setelah simpan, ambil 10 pesan terakhir untuk konteks AI.
  withHistory: z.boolean().optional(),
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
    // Cari WA session dulu untuk dapat userId.
    const wa = await prisma.whatsappSession.findUnique({
      where: { id: body.sessionId },
      select: { id: true, userId: true },
    })
    if (!wa) {
      return NextResponse.json(
        { success: false, error: 'session tidak ditemukan' },
        { status: 404 },
      )
    }

    // Upsert Contact: kalau belum ada → buat; kalau sudah → update name
    // (bila baru ada pushName) dan lastMessageAt.
    // Cari kontak existing berdasarkan userId + phoneNumber (bukan waSessionId)
    // supaya tidak duplikat saat session berganti.
    let contact = await prisma.contact.findFirst({
      where: { userId: wa.userId, phoneNumber: body.phoneNumber },
    })
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          userId: wa.userId,
          waSessionId: body.sessionId,
          phoneNumber: body.phoneNumber,
          name: body.pushName ?? null,
          lastMessageAt: new Date(),
        },
      })
    } else {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          name: body.pushName ?? undefined,
          lastMessageAt: new Date(),
          waSessionId: body.sessionId,
        },
      })
    }

    const message = await prisma.message.create({
      data: {
        contactId: contact.id,
        waSessionId: body.sessionId,
        content: body.content,
        role: body.role,
        tokensUsed: body.tokensUsed ?? null,
      },
    })

    let history: { role: string; content: string; createdAt: Date }[] = []
    if (body.withHistory) {
      // Ambil 10 pesan terakhir (terbaru dulu), lalu balik ke kronologis untuk AI.
      const recent = await prisma.message.findMany({
        where: { contactId: contact.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { role: true, content: true, createdAt: true },
      })
      history = recent.reverse()
    }

    return NextResponse.json({
      success: true,
      data: {
        messageId: message.id,
        contactId: contact.id,
        contact: {
          aiPaused: contact.aiPaused,
          isResolved: contact.isResolved,
        },
        history,
      },
    })
  } catch (err) {
    console.error('[POST /api/internal/messages] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'internal error' },
      { status: 500 },
    )
  }
}
