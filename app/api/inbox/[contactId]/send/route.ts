// POST /api/inbox/[contactId]/send
// Body: { content: string }
// Kirim pesan manual dari CS via wa-service, simpan ke DB sebagai HUMAN msg.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { resolveConnectedSessionId } from '@/lib/wa-session'
import { waService } from '@/lib/wa-service'

const bodySchema = z.object({
  content: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(4000),
})

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
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  try {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: session.user.id },
      select: { id: true, phoneNumber: true, waSessionId: true },
    })
    if (!contact) return jsonError('Kontak tidak ditemukan', 404)

    // Kontak di-pin ke waSessionId saat dibuat; setelah user re-scan/re-pair,
    // session itu jadi DISCONNECTED dan id-nya berubah. Kirim lewat session
    // mati = "session belum siap" → balasan gagal senyap padahal chat tampil di
    // inbox. Resolve ke session yang BENAR-BENAR terhubung (prefer session
    // kontak kalau masih konek, else session aktif user terbaru).
    const sendSessionId = await resolveConnectedSessionId(
      session.user.id,
      contact.waSessionId,
    )
    if (!sendSessionId) {
      return jsonError(
        'WhatsApp belum terhubung. Hubungkan dulu di menu WhatsApp sebelum membalas.',
        409,
      )
    }

    // 1. Kirim ke wa-service. Response berisi messageId (Baileys key.id) yang
    // kita simpan sebagai externalMsgId — dipakai dedup saat event upsert
    // fromMe untuk pesan yang sama masuk lagi.
    const send = await waService.sendMessage(
      sendSessionId,
      contact.phoneNumber,
      parsed.data.content,
    )
    if (!send.success) {
      return jsonError(send.error || 'Gagal kirim ke WhatsApp', 502)
    }

    // 2. Simpan ke DB sebagai AGENT/WEB_DASHBOARD. waSessionId = session yang
    // dipakai kirim (yang terhubung), supaya dedup echo fromMe (checkMessageExists
    // by externalMsgId+sessionId) cocok dan tidak menyimpan pesan ganda.
    const message = await prisma.message.create({
      data: {
        contactId: contact.id,
        waSessionId: sendSessionId,
        content: parsed.data.content,
        role: 'AGENT',
        status: 'SENT',
        source: 'WEB_DASHBOARD',
        externalMsgId: send.data?.messageId ?? null,
      },
      select: {
        id: true,
        content: true,
        role: true,
        status: true,
        createdAt: true,
      },
    })
    await prisma.contact.update({
      where: { id: contact.id },
      data: { lastMessageAt: message.createdAt },
    })

    return jsonOk({
      id: message.id,
      content: message.content,
      role: message.role,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
    })
  } catch (err) {
    console.error('[POST /api/inbox/:id/send] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
