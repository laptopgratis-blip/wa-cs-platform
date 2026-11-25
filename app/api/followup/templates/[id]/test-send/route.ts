// POST /api/followup/templates/[id]/test-send
// Kirim preview template ke nomor admin (UserShippingProfile.waConfirmNumber)
// via smartSend (provider-aware): Baileys/Cloud dalam window → teks [TEST];
// Cloud di luar window → template INFO_GENERIC (bila sudah APPROVED).
// Template ber-"Kirim dari" diuji dari nomor itu saja (offline → 400).
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  DUMMY_RESOLVE_CONTEXT,
  resolveTemplateVariables,
} from '@/lib/services/followup-variables'
import {
  loadTemplateSender,
  templateSenderFailure,
} from '@/lib/services/followup-template-sender'
import { smartSend } from '@/lib/services/wa-send/smart-send'
import { listSenderCandidates } from '@/lib/wa-session'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const template = await prisma.followUpTemplate.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, name: true, message: true, senderSessionId: true },
    })
    if (!template) return jsonError('Template tidak ditemukan', 404)

    const profile = await prisma.userShippingProfile.findUnique({
      where: { userId: session.user.id },
      select: { waConfirmNumber: true },
    })
    if (!profile?.waConfirmNumber) {
      return jsonError(
        'Nomor WA admin belum di-set. Buka Rekening (/bank-accounts) untuk set waConfirmNumber.',
        400,
      )
    }

    // "Kirim dari" template ikut diuji: kirim HANYA dari nomor itu.
    const pinned = await loadTemplateSender({
      userId: session.user.id,
      senderSessionId: template.senderSessionId,
    })
    if (pinned.kind === 'OFFLINE' || pinned.kind === 'REMOVED') {
      const failure = templateSenderFailure(pinned)
      return jsonError(failure.detail ?? 'Nomor pengirim tidak tersedia', 400)
    }

    const [user, bankAccounts, candidates] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true } }),
      prisma.userBankAccount.findMany({ where: { userId: session.user.id, isActive: true } }),
      pinned.kind === 'ONLINE'
        ? listSenderCandidates({ explicitSessionIds: [pinned.sessionId] })
        : listSenderCandidates({ userId: session.user.id, preferContactPhone: profile.waConfirmNumber }),
    ])
    if (candidates.length === 0) {
      return jsonError('WhatsApp belum tersambung. Buka /whatsapp untuk konek dulu.', 400)
    }

    const ctx = {
      ...DUMMY_RESOLVE_CONTEXT,
      user: { id: user?.id ?? '', name: user?.name ?? null },
      ...(bankAccounts.length > 0 ? { bankAccounts } : {}),
      shippingProfile: profile as never,
      ...(pinned.kind === 'ONLINE' && pinned.number ? { csNumber: pinned.number } : {}),
    }
    const resolved = resolveTemplateVariables(template.message, ctx)
    const finalMessage = `[TEST] ${resolved}`
    const storeName = user?.name ?? 'Toko Kami'

    const send = await smartSend({
      candidates,
      to: profile.waConfirmNumber,
      text: finalMessage,
      // Cloud di luar window: pakai template platform INFO_GENERIC (bila approved).
      template: {
        purposeKey: 'INFO_GENERIC',
        params: { body: [storeName, storeName, `[TEST] ${template.name}`] },
      },
      purpose: 'TEST',
      source: 'FOLLOWUP',
    })

    if (!send.success) {
      return jsonError(`Gagal kirim test: ${send.error}`, 500)
    }
    return jsonOk({ sent: true, to: profile.waConfirmNumber, preview: finalMessage, via: send.via })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/templates test-send]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
