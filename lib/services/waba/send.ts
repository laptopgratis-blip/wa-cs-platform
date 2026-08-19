// Kirim pesan teks via WhatsApp Cloud API untuk sesi provider CLOUD_API.
// Kontrak: TIDAK PERNAH throw — bentuk hasil meniru envelope waService
// supaya dispatcher lib/wa-service.ts bisa mengembalikannya apa adanya.

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { graphRequest } from './graph'

// Kode error Meta yang berarti token/sesi tidak sehat → sesi di-ERROR-kan.
const TOKEN_ERROR_CODES = new Set([190])
// Window 24 jam customer service sudah tutup.
const WINDOW_ERROR_CODES = new Set([131047, 131026])

export interface CloudSendResult {
  success: boolean
  data?: { sessionId: string; phoneNumber: string; messageId: string | null }
  error?: string
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
    const session = await prisma.whatsappSession.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        userId: true,
        provider: true,
        status: true,
        phoneNumberId: true,
        wabaTokenEnc: true,
      },
    })
    if (!session || session.provider !== 'CLOUD_API') {
      return { success: false, error: 'Sesi Cloud API tidak ditemukan' }
    }
    if (!session.phoneNumberId || !session.wabaTokenEnc) {
      return { success: false, error: 'Sesi Cloud API belum punya kredensial lengkap' }
    }
    // Hanya DISCONNECTED (diputus user) yang diblokir lokal. ERROR/PAUSED
    // tetap boleh mencoba kirim — biar Meta yang jadi sumber kebenaran; kalau
    // nomor memang belum aktif, error Meta di bawah menjelaskannya.
    if (session.status === 'DISCONNECTED') {
      return { success: false, error: 'Sesi Cloud API sudah diputus — hubungkan ulang' }
    }

    // Nomor tujuan dalam digit murni (format kanonik Contact.phoneNumber,
    // sama dengan wa_id Meta).
    const to = input.phoneNumber.replace(/\D/g, '')
    if (!to) return { success: false, error: 'Nomor tujuan tidak valid' }

    // Guard window 24 jam: free-form hanya boleh selama window aktif.
    // Window dibuka/di-refresh oleh pesan masuk (lib/services/waba/inbound).
    const contact = await prisma.contact.findFirst({
      where: { userId: session.userId, phoneNumber: to },
      select: { windowExpiresAt: true },
    })
    if (!contact?.windowExpiresAt || contact.windowExpiresAt < new Date()) {
      return {
        success: false,
        error:
          'Window 24 jam Meta sudah tutup untuk kontak ini — pesan free-form ' +
          'hanya bisa dikirim dalam 24 jam sejak pesan terakhir customer. ' +
          'Gunakan template (segera hadir) atau tunggu customer chat dulu.',
      }
    }

    let token: string
    try {
      token = decrypt(session.wabaTokenEnc)
    } catch {
      return {
        success: false,
        error: 'Token WABA tidak bisa didekripsi (ENCRYPTION_KEY berubah?) — hubungkan ulang nomor',
      }
    }

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
        await prisma.whatsappSession
          .update({
            where: { id: session.id },
            data: { status: 'ERROR', lastError: `Token Meta ditolak: ${message}` },
          })
          .catch(() => undefined)
        return { success: false, error: 'Token Meta ditolak — hubungkan ulang nomor via Embedded Signup' }
      }
      if (code !== undefined && WINDOW_ERROR_CODES.has(code)) {
        return { success: false, error: 'Meta menolak: window 24 jam sudah tutup untuk kontak ini' }
      }
      return { success: false, error: `Meta menolak pesan: ${message}${code ? ` (code ${code})` : ''}` }
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
    return { success: false, error: `Gagal kirim via Cloud API: ${(err as Error).message}` }
  }
}
