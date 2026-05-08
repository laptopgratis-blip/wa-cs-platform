// GET  /api/followup/templates  — list all templates user
// POST /api/followup/templates  — create new template
//
// Plan gating: POWER only (requireOrderSystemAccess).
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { followupTemplateCreateSchema } from '@/lib/validations/followup'

export async function GET() {
  try {
    const { session } = await requireOrderSystemAccess()
    const templates = await prisma.followUpTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: [{ trigger: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    })
    return jsonOk(templates)
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

    const template = await prisma.followUpTemplate.create({
      data: {
        userId: session.user.id,
        name: data.name,
        trigger: data.trigger,
        paymentMethod: data.paymentMethod,
        applyOnPaymentStatus: data.applyOnPaymentStatus,
        applyOnDeliveryStatus: data.applyOnDeliveryStatus,
        delayDays: data.delayDays,
        message: data.message,
        isActive: data.isActive,
        scope: data.scope,
        orderFormId: data.scope === 'FORM' ? data.orderFormId : null,
        order: data.order,
        isDefault: false,
      },
    })

    return jsonOk(template, 201)
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/templates POST]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
