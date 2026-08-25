// GET  /api/broadcast — list semua broadcast user
// POST /api/broadcast — buat broadcast baru (status DRAFT atau SCHEDULED)
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { MESSAGE_CREDIT_BILLING_ENABLED } from '@/lib/billing/message-credit-mode'
import { buildTargetWhere } from '@/lib/broadcast'
import { prisma } from '@/lib/prisma'
import { getMessageCreditRates } from '@/lib/services/message-credits'
import { BROADCAST_LIST_SELECT, serializeBroadcastRow } from '@/lib/services/broadcast/list-select'
import {
  buildSendComponents,
  renderTemplateText,
  TemplateParamError,
  type TemplateSendParams,
} from '@/lib/services/waba/template-payload'
import { broadcastCreateSchema } from '@/lib/validations/broadcast'

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const rows = await prisma.broadcast.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: BROADCAST_LIST_SELECT,
    })
    return jsonOk(rows.map(serializeBroadcastRow))
  } catch (err) {
    console.error('[GET /api/broadcast] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = broadcastCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }
  const data = parsed.data

  try {
    // Pastikan WA session milik user.
    const wa = await prisma.whatsappSession.findFirst({
      where: { id: data.waSessionId, userId: session.user.id, isActive: true },
      select: { id: true, provider: true, wabaId: true },
    })
    if (!wa) return jsonError('WhatsApp session tidak ditemukan', 404)

    // ── Cloud API (Trek 2B): wajib template APPROVED dari WABA yang sama,
    // parameter lengkap; `message` diisi render template (preview di kartu).
    let message = data.message
    let template: { id: string; category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' } | null = null
    let templateParams: TemplateSendParams | null = null
    if (wa.provider === 'CLOUD_API') {
      if (!data.templateId) {
        return jsonError('Nomor Cloud API hanya bisa broadcast pakai template Meta yang disetujui — pilih template', 400)
      }
      const tpl = await prisma.wabaTemplate.findFirst({
        where: { id: data.templateId, userId: session.user.id },
      })
      if (!tpl) return jsonError('Template tidak ditemukan', 404)
      if (tpl.wabaId !== wa.wabaId) return jsonError('Template milik WABA lain dari nomor pengirim', 400)
      if (tpl.status !== 'APPROVED') {
        return jsonError(`Template "${tpl.name}" berstatus ${tpl.status} — hanya template APPROVED yang bisa dikirim`, 400)
      }
      templateParams = data.templateParams ?? { body: [] }
      try {
        // Validasi jumlah/jenis param dengan nilai sampel ({nama}/{nomor} diganti contoh).
        buildSendComponents(tpl, {
          ...templateParams,
          body: templateParams.body.map((v) => v.replaceAll('{nama}', 'Budi').replaceAll('{nomor}', '628123456789')),
        })
      } catch (err) {
        if (err instanceof TemplateParamError) return jsonError(err.message, 400)
        throw err
      }
      message = renderTemplateText(tpl, templateParams)
      template = { id: tpl.id, category: tpl.category }
    } else if (!data.message.trim()) {
      return jsonError('Pesan tidak boleh kosong', 400)
    }

    // Hitung jumlah target (MARKETING Cloud → kecualikan opt-out).
    const totalTargets = await prisma.contact.count({
      where: buildTargetWhere({
        userId: session.user.id,
        waSessionId: data.waSessionId,
        tags: data.targetTags,
        stages: data.targetStages,
        excludeMarketingOptOut: template?.category === 'MARKETING',
      }) as never,
    })

    let estimatedCreditRp = 0
    // Billing kredit nonaktif → estimasi disimpan 0 (kolom tetap ada).
    if (template && MESSAGE_CREDIT_BILLING_ENABLED) {
      const rates = await getMessageCreditRates()
      estimatedCreditRp = totalTargets * rates[template.category]
    }

    const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null
    const status = scheduledAt && scheduledAt.getTime() > Date.now() ? 'SCHEDULED' : 'DRAFT'

    const broadcast = await prisma.broadcast.create({
      data: {
        userId: session.user.id,
        waSessionId: data.waSessionId,
        name: data.name,
        message,
        targetTags: data.targetTags,
        targetStages: data.targetStages,
        status,
        scheduledAt,
        totalTargets,
        provider: wa.provider,
        templateId: template?.id ?? null,
        templateParams: templateParams ? (templateParams as object) : undefined,
        category: template?.category ?? null,
        estimatedCreditRp,
      },
      select: { id: true, status: true, totalTargets: true, estimatedCreditRp: true },
    })

    return jsonOk(broadcast, 201)
  } catch (err) {
    console.error('[POST /api/broadcast] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
