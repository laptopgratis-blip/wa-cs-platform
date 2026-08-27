// POST /api/inbox/[contactId]/send-template
// Body: { templateId: string, params: TemplateSendParams }
// CS mengirim TEMPLATE Meta ke kontak (sesi Cloud API) — dipakai saat window
// 24 jam tutup. Memotong Kredit Pesan sesuai kategori (lihat compliance).
import type { NextResponse } from 'next/server'
import { NextResponse as NextRes } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { sendCloudTemplate } from '@/lib/services/waba/send-template'
import { templateSendParamsSchema } from '@/lib/validations/waba-template'

const bodySchema = z.object({
  templateId: z.string().trim().min(1),
  params: templateSendParamsSchema.default({ body: [] }),
  /** Opsional: paksa sesi tertentu (default: sesi Cloud milik WABA template). */
  sessionId: z.string().trim().min(1).optional(),
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
      select: {
        id: true,
        phoneNumber: true,
        waSessionId: true,
        name: true,
        waSession: { select: { provider: true, displayName: true, phoneNumber: true } },
      },
    })
    if (!contact) return jsonError('Kontak tidak ditemukan', 404)

    // GATE PROVIDER — wajib sebelum fallback pemilihan sesi di bawah.
    // Template Meta hanya ada di jalur Cloud API. Tanpa gate ini, kontak yang
    // ter-pin ke nomor Baileys akan jatuh ke fallback "sesi Cloud mana pun yang
    // WABA-nya cocok", sehingga pesan keluar dari NOMOR LAIN tanpa pemberitahuan
    // — dan lebih parah, saveMessage lalu me-repin kontak itu ke sesi Cloud
    // (purpose 'CS' → skipRepin false), memindahkan seluruh percakapan secara
    // permanen ke nomor yang salah.
    if (contact.waSession && contact.waSession.provider !== 'CLOUD_API') {
      const nomor = contact.waSession.displayName ?? contact.waSession.phoneNumber ?? 'nomor ini'
      return jsonError(
        `Percakapan ini berjalan lewat ${nomor} (WhatsApp QR/Baileys). Template Meta hanya bisa dikirim dari nomor WhatsApp Business resmi (Cloud API), jadi balas dengan pesan biasa saja.`,
        409,
      )
    }

    const template = await prisma.wabaTemplate.findFirst({
      where: { id: parsed.data.templateId, userId: session.user.id },
      select: { id: true, wabaId: true },
    })
    if (!template) return jsonError('Template tidak ditemukan', 404)

    // Sesi Cloud yang memakai WABA template ini: prefer sesi kontak, lalu
    // sesi CONNECTED terbaru di WABA yang sama. sessionId dari body WAJIB
    // divalidasi kepemilikan + WABA-nya — tanpa ini user bisa menumpang sesi
    // (dan kredit) user lain (IDOR).
    let sendSessionId: string | null = null
    if (parsed.data.sessionId) {
      const owned = await prisma.whatsappSession.findFirst({
        where: {
          id: parsed.data.sessionId,
          userId: session.user.id,
          provider: 'CLOUD_API',
          wabaId: template.wabaId,
        },
        select: { id: true },
      })
      if (!owned) return jsonError('Sesi pengirim tidak valid', 403)
      sendSessionId = owned.id
    }
    if (!sendSessionId) {
      const pinned = await prisma.whatsappSession.findFirst({
        where: { id: contact.waSessionId, userId: session.user.id, provider: 'CLOUD_API', wabaId: template.wabaId, status: { not: 'DISCONNECTED' } },
        select: { id: true },
      })
      sendSessionId = pinned?.id ?? null
    }
    if (!sendSessionId) {
      const any = await prisma.whatsappSession.findFirst({
        where: { userId: session.user.id, provider: 'CLOUD_API', wabaId: template.wabaId, status: 'CONNECTED', isActive: true },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      })
      sendSessionId = any?.id ?? null
    }
    if (!sendSessionId) {
      return jsonError('Tidak ada sesi Cloud API terhubung untuk WABA template ini', 409)
    }

    const r = await sendCloudTemplate({
      sessionId: sendSessionId,
      to: contact.phoneNumber,
      templateId: template.id,
      params: parsed.data.params,
      purpose: 'CS',
      source: 'TEMPLATE',
      contactId: contact.id,
      pushName: contact.name,
    })
    if (!r.success) {
      const status = r.code === 'INSUFFICIENT_CREDIT' ? 402 : r.code === 'META_ERROR' ? 502 : 409
      return NextRes.json({ success: false, error: r.error, code: r.code }, { status })
    }

    const message = r.data?.messageDbId
      ? await prisma.message.findUnique({
          where: { id: r.data.messageDbId },
          select: { id: true, content: true, role: true, status: true, source: true, createdAt: true },
        })
      : null
    return jsonOk({
      id: message?.id ?? null,
      content: message?.content ?? '',
      role: message?.role ?? 'AGENT',
      status: message?.status ?? 'SENT',
      source: message?.source ?? 'TEMPLATE',
      createdAt: (message?.createdAt ?? new Date()).toISOString(),
      chargedRp: r.data?.chargedRp ?? 0,
      category: r.data?.category ?? null,
    })
  } catch (err) {
    console.error('[POST /api/inbox/:id/send-template] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
