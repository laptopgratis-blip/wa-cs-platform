// POST /api/followup/templates/[id]/test-send
//
// Kirim preview pesan template ke nomor admin user (UserShippingProfile.
// waConfirmNumber), pakai dummy data untuk substitusi variable + prefix [TEST].
// Tujuan: user bisa cek render template tanpa harus tunggu order real.
import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import {
  DUMMY_RESOLVE_CONTEXT,
  resolveTemplateVariables,
} from '@/lib/services/followup-variables'
import { waService } from '@/lib/wa-service'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { session } = await requireOrderSystemAccess()
    const { id } = await params

    const template = await prisma.followUpTemplate.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, name: true, message: true },
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

    const waSession = await prisma.whatsappSession.findFirst({
      where: { userId: session.user.id, status: 'CONNECTED' },
      select: { id: true },
    })
    if (!waSession) {
      return jsonError(
        'WhatsApp belum tersambung. Buka /whatsapp untuk konek dulu.',
        400,
      )
    }

    // Pakai user.name real supaya {nama_toko} sesuai. Sisanya dummy.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true },
    })

    const bankAccounts = await prisma.userBankAccount.findMany({
      where: { userId: session.user.id, isActive: true },
    })

    const ctx =
      bankAccounts.length > 0
        ? {
            ...DUMMY_RESOLVE_CONTEXT,
            user: { id: user?.id ?? '', name: user?.name ?? null },
            bankAccounts,
            shippingProfile: profile as never,
          }
        : {
            ...DUMMY_RESOLVE_CONTEXT,
            user: { id: user?.id ?? '', name: user?.name ?? null },
            shippingProfile: profile as never,
          }

    const resolved = resolveTemplateVariables(template.message, ctx)
    const finalMessage = `[TEST] ${resolved}`

    const sendResult = await waService
      .sendMessage(waSession.id, profile.waConfirmNumber, finalMessage)
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }))

    if (!sendResult.ok) {
      return jsonError(`Gagal kirim test: ${sendResult.error}`, 500)
    }

    return jsonOk({
      sent: true,
      to: profile.waConfirmNumber,
      preview: finalMessage,
    })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[followup/templates test-send]', e)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
