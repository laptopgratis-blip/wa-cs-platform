// PATCH  /api/followup/templates/[id]  — update template
// DELETE /api/followup/templates/[id]  — hapus template (cascade ke queue & log)
//
// Plan gating: POWER only.
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { followupTemplateUpdateSchema } from '@/lib/validations/followup'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const existing = await prisma.followUpTemplate.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) return jsonError('Template tidak ditemukan', 404)

    const body = await req.json().catch(() => ({}))
    const parsed = followupTemplateUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const data = parsed.data

    if (data.scope === 'FORM' && data.orderFormId == null && !existing.orderFormId) {
      return jsonError('orderFormId wajib kalau scope = FORM', 400)
    }

    if (data.orderFormId) {
      const form = await prisma.orderForm.findFirst({
        where: { id: data.orderFormId, userId: session.user.id },
        select: { id: true },
      })
      if (!form) return jsonError('Form tidak ditemukan', 404)
    }

    const updated = await prisma.followUpTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.trigger !== undefined && { trigger: data.trigger }),
        ...(data.paymentMethod !== undefined && {
          paymentMethod: data.paymentMethod,
        }),
        ...(data.applyOnPaymentStatus !== undefined && {
          applyOnPaymentStatus: data.applyOnPaymentStatus,
        }),
        ...(data.applyOnDeliveryStatus !== undefined && {
          applyOnDeliveryStatus: data.applyOnDeliveryStatus,
        }),
        ...(data.delayDays !== undefined && { delayDays: data.delayDays }),
        ...(data.message !== undefined && { message: data.message }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.scope !== undefined && { scope: data.scope }),
        ...(data.orderFormId !== undefined && {
          orderFormId:
            (data.scope ?? existing.scope) === 'FORM' ? data.orderFormId : null,
        }),
        ...(data.order !== undefined && { order: data.order }),
      },
    })

    return jsonOk(updated)
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/templates PATCH]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const existing = await prisma.followUpTemplate.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })
    if (!existing) return jsonError('Template tidak ditemukan', 404)

    await prisma.followUpTemplate.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/templates DELETE]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
