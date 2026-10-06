// GET  /api/followup/templates  — list all templates user (+ ringkasan
//      Template Meta tertaut & metaIssue terhadap WABA aktif)
// POST /api/followup/templates  — create new template (tautan Template Meta
//      divalidasi: milik user, didukung, peta {{n}} lengkap & sah)
//
// Plan gating: POWER only (requireOrderSystemAccess).
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  META_SUMMARY_SELECT,
  metaIssueResolver,
  resolveMetaLinkInput,
} from '@/lib/services/followup-template-meta'
import { followupTemplateCreateSchema } from '@/lib/validations/followup'

export async function GET() {
  try {
    const { session } = await requireOrderSystemAccess()
    const [templates, issueOf] = await Promise.all([
      prisma.followUpTemplate.findMany({
        where: { userId: session.user.id },
        include: { metaTemplate: { select: META_SUMMARY_SELECT } },
        orderBy: [{ trigger: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      }),
      metaIssueResolver(session.user.id),
    ])
    return jsonOk(templates.map((t) => ({ ...t, metaIssue: issueOf(t.metaTemplate) })))
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/templates GET]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  try {
    const { session } = await requireOrderSystemAccess()

    const body = await req.json().catch(() => ({}))
    const parsed = followupTemplateCreateSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const data = parsed.data

    if (data.scope === 'FORM' && !data.orderFormId) {
      return jsonError('orderFormId wajib kalau scope = FORM', 400)
    }

    if (data.orderFormId) {
      const form = await prisma.orderForm.findFirst({
        where: { id: data.orderFormId, userId: session.user.id },
        select: { id: true },
      })
      if (!form) return jsonError('Form tidak ditemukan', 404)
    }

    const link = await resolveMetaLinkInput({
      userId: session.user.id,
      trigger: data.trigger,
      metaTemplateId: data.metaTemplateId,
      metaParamMap: data.metaParamMap,
    })
    if (!link.ok) return jsonError(link.error, link.status)

    const template = await prisma.followUpTemplate.create({
      data: {
        userId: session.user.id,
        name: data.name,
        trigger: data.trigger,
        paymentMethod: data.paymentMethod,
        orderType: data.orderType,
        applyOnPaymentStatus: data.applyOnPaymentStatus,
        applyOnDeliveryStatus: data.applyOnDeliveryStatus,
        delayDays: data.delayDays,
        message: data.message,
        isActive: data.isActive,
        scope: data.scope,
        orderFormId: data.scope === 'FORM' ? data.orderFormId : null,
        order: data.order,
        isDefault: false,
        ...(link.data ?? {}),
      },
    })

    return jsonOk(template, 201)
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/templates POST]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
