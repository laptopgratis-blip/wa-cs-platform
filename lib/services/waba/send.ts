// Kirim pesan teks via WhatsApp Cloud API untuk sesi provider CLOUD_API.
// Kontrak: TIDAK PERNAH throw — bentuk hasil meniru envelope waService
// supaya dispatcher lib/wa-service.ts bisa mengembalikannya apa adanya.

import { prisma } from '@/lib/prisma'
import { assertCanSendCloud, type CloudComplianceCode } from './compliance'
import { getWabaCredentialsBySession } from './credentials'
import { graphRequest } from './graph'

// Kode error Meta yang berarti token/sesi tidak sehat → sesi di-ERROR-kan.
const TOKEN_ERROR_CODES = new Set([190])
// Window 24 jam customer service sudah tutup.
const WINDOW_ERROR_CODES = new Set([131047, 131026])

export interface CloudSendResult {
  success: boolean
  data?: { sessionId: string; phoneNumber: string; messageId: string | null }
  error?: string
  /** Kode kegagalan terstruktur (UI inbox memakai WINDOW_CLOSED → tawarkan template). */
  code?: CloudComplianceCode | 'META_ERROR' | 'TOKEN_INVALID'
}

interface CloudMessagesResponse {
  messages?: { id: string }[]
}

/**
 * Kirim teks free-form. Pra-cek window 24 jam dari Contact.windowExpiresAt
 * supaya kegagalan yang pasti terjadi diberi pesan jelas tanpa memanggil Meta.
 */
export async function sendCloudText(input: {
  sessionId: string
  phoneNumber: string
  content: string
}): Promise<CloudSendResult> {
  try {
    // Aturan kepatuhan terpusat (sesi valid, blacklist, window 24 jam) —
    // lib/services/waba/compliance.ts. Nomor dinormalisasi ke digit murni.
    const check = await assertCanSendCloud({
      sessionId: input.sessionId,
      to: input.phoneNumber,
      intent: { kind: 'freeform' },
    })
    if (!check.ok) return { success: false, error: check.message, code: check.code }
    const { session, to } = check

    const credRes = await getWabaCredentialsBySession(session.id)
    if (!credRes.ok) return { success: false, error: credRes.error, code: 'SESSION_UNAVAILABLE' }
    const token = credRes.creds.token

    const result = await graphRequest<CloudMessagesResponse>(
      `/${session.phoneNumberId}/messages`,
      {
        method: 'POST',
        token,
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: input.content },
        },
      },
    )

    if (!result.ok) {
      const { code, httpStatus, message } = result.error
      // Token mati/dicabut → tandai sesi ERROR supaya UI & cron tahu.
      if ((code !== undefined && TOKEN_ERROR_CODES.has(code)) || httpStatus === 401) {
        // lastError tampil di tooltip kartu sesi — pakai copy ramah, pesan
        // mentah Meta (Inggris) cukup di log server.
        console.error(`[waba/send] token ditolak sesi ${session.id}: ${message}`)
        await prisma.whatsappSession
          .update({
            where: { id: session.id },
            data: { status: 'ERROR', lastError: 'Token Meta ditolak — hubungkan ulang nomor via Embedded Signup' },
          })
          .catch(() => undefined)
        return { success: false, error: 'Token Meta ditolak — hubungkan ulang nomor via Embedded Signup', code: 'TOKEN_INVALID' }
      }
      if (code !== undefined && WINDOW_ERROR_CODES.has(code)) {
        return { success: false, error: 'Meta menolak: window 24 jam sudah tutup untuk kontak ini', code: 'WINDOW_CLOSED' }
      }
      return { success: false, error: `Meta menolak pesan: ${message}${code ? ` (code ${code})` : ''}`, code: 'META_ERROR' }
    }

    return {
      success: true,
      data: {
        sessionId: session.id,
        phoneNumber: to,
        messageId: result.data.messages?.[0]?.id ?? null,
      },
    }
  } catch (err) {
    // Jaring pengaman terakhir — kontrak never-throw.
    console.error('[waba/send] gagal:', err)
    return { success: false, error: `Gagal kirim via Cloud API: ${(err as Error).message}`, code: 'META_ERROR' }
  }
}
