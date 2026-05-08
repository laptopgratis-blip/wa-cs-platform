// POST /api/orders/[id]/send-manual-message
//
// Kirim pesan WA manual ke customer dari halaman detail order. Boleh kirim:
//   - templateId (resolve via followup-variables, simpan log dengan templateId)
//   - message raw (free-form, tetap di-resolve variable supaya {nama} dst jalan)
// Source = MANUAL di FollowUpLog.
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { resolveTemplateVariables } from '@/lib/services/followup-variables'
import { followupManualSendSchema } from '@/lib/validations/followup'
import { waService } from '@/lib/wa-service'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const order = await prisma.userOrder.findFirst({
      where: { id, userId: session.user.id },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!order) return jsonError('Order tidak ditemukan', 404)

    const body = await req.json().catch(() => ({}))
    const parsed = followupManualSendSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
    }
    const { message: rawMessage, templateId } = parsed.data

    // Cek blacklist (manual send tetap respect blacklist — kalau mau kirim,
    // unblock dulu).
    const blacklisted = await prisma.followUpBlacklist.findUnique({
      where: {
        userId_customerPhone: {
          userId: session.user.id,
          customerPhone: order.customerPhone,
        },
      },
    })
    if (blacklisted) {
      return jsonError(
        'Customer ada di blacklist. Unblock dulu di /pesanan/follow-up tab Blacklist.',
        400,
      )
    }

    const waSession = await prisma.whatsappSession.findFirst({
      where: { userId: session.user.id, status: 'CONNECTED' },
      select: { id: true },
    })
    if (!waSession) {
      return jsonError('WhatsApp belum tersambung', 400)
    }

    let templateMessage: string
    let resolvedTemplateId: string | null = null
    if (templateId) {
      const template = await prisma.followUpTemplate.findFirst({
        where: { id: templateId, userId: session.user.id },
      })
      if (!template) return jsonError('Template tidak ditemukan', 404)
      templateMessage = template.message
      resolvedTemplateId = template.id
    } else {
      templateMessage = rawMessage as string
    }

    const [bankAccounts, shippingProfile] = await Promise.all([
      prisma.userBankAccount.findMany({
        where: { userId: session.user.id, isActive: true },
      }),
      prisma.userShippingProfile.findUnique({
        where: { userId: session.user.id },
      }),
    ])

    const resolved = resolveTemplateVariables(templateMessage, {
      order,
      user: order.user,
      bankAccounts,
      shippingProfile,
    })

    const sendResult = await waService
      .sendMessage(waSession.id, order.customerPhone, resolved)
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }))

    if (!sendResult.ok) {
      await prisma.followUpLog.create({
        data: {
          userId: session.user.id,
          orderId: order.id,
          templateId: resolvedTemplateId,
          customerPhone: order.customerPhone,
          message: resolved,
          status: 'FAILED',
          errorMessage: sendResult.error,
          source: 'MANUAL',
        },
      })
      return jsonError(`Gagal kirim: ${sendResult.error}`, 500)
    }

    await prisma.followUpLog.create({
      data: {
        userId: session.user.id,
        orderId: order.id,
        templateId: resolvedTemplateId,
        customerPhone: order.customerPhone,
        message: resolved,
        status: 'SENT',
        source: 'MANUAL',
      },
    })

    return jsonOk({ sent: true, message: resolved })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[orders/send-manual-message]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
