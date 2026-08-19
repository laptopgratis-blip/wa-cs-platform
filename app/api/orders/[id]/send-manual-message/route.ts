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
import { smartSend } from '@/lib/services/wa-send/smart-send'
import { followupManualSendSchema } from '@/lib/validations/followup'
import { listSenderCandidates } from '@/lib/wa-session'

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

    // Provider-aware (Trek 2B): Baileys / Cloud dalam window → teks; Cloud
    // di luar window → template INFO_GENERIC (bila APPROVED).
    const candidates = await listSenderCandidates({
      userId: session.user.id,
      preferContactPhone: order.customerPhone,
    })
    if (candidates.length === 0) {
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

    const send = await smartSend({
      candidates,
      to: order.customerPhone,
      text: resolved,
      template: {
        purposeKey: 'INFO_GENERIC',
        params: {
          body: [
            order.customerName || 'Kak',
            order.user.name || 'Toko Kami',
            `pesan tentang pesanan ${order.invoiceNumber ?? order.id}: ${resolved.slice(0, 300)}`,
          ],
        },
      },
      purpose: 'NOTIF',
      source: 'SYSTEM',
    })
    // Dulu: .then(data => ({ok:true, data})) TANPA cek data.success — kegagalan
    // wa-service tercatat SENT palsu. smartSend mengembalikan success nyata.
    const sendResult = send.success
      ? { ok: true as const }
      : { ok: false as const, error: send.error ?? 'Gagal kirim' }

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
