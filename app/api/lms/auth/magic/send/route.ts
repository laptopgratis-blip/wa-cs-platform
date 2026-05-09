// POST /api/lms/auth/magic/send
// Body: { phone: string, channel: "WA" | "EMAIL", email?: string }
//
// Issue magic link untuk student lalu kirim via channel pilihan. Throttle
// 3/jam per phone (mirror OTP). Kalau channel=EMAIL dan email tidak di-input,
// service akan lookup dari Enrollment/StudentSession terbaru.
//
// Public endpoint — flow login.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { sendStudentMagicLinkEmail } from '@/lib/email'
import {
  StudentMagicError,
  findStudentEmailByPhone,
  issueMagicLink,
} from '@/lib/services/lms/student-magic'
import { sendMagicLinkViaWa } from '@/lib/services/lms/wa-magic-sender'

const schema = z.object({
  phone: z.string().min(8).max(20),
  channel: z.enum(['WA', 'EMAIL']),
  email: z.string().email().optional(),
})

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Nomor WA & channel wajib diisi')

  try {
    const { phone, channel } = parsed.data

    // Pre-resolve email kalau channel=EMAIL — supaya kalau email tidak ada,
    // gagal SEBELUM issue token (hemat resource + UX clearer).
    let targetEmail: string | null = null
    if (channel === 'EMAIL') {
      targetEmail = parsed.data.email ?? (await findStudentEmailByPhone(phone))
      if (!targetEmail) {
        return jsonError(
          'Email tidak ditemukan untuk nomor ini. Masukkan email manual.',
          400,
        )
      }
    }

    const link = await issueMagicLink({
      phoneRaw: phone,
      channel,
      trigger: 'RESEND',
    })

    if (channel === 'WA') {
      const sendWa = await sendMagicLinkViaWa({
        studentPhone: link.studentPhone,
        magicUrl: link.url,
      })
      return jsonOk({
        ok: true,
        deliveryChannel: sendWa.delivered ? 'WA' : 'FAILED',
        message: sendWa.delivered
          ? 'Link login terkirim via WhatsApp.'
          : 'WA admin tidak aktif. Coba kirim via Email.',
      })
    }

    // channel === 'EMAIL'
    try {
      await sendStudentMagicLinkEmail({
        email: targetEmail!,
        magicUrl: link.url,
      })
      return jsonOk({
        ok: true,
        deliveryChannel: 'EMAIL',
        message: `Link login dikirim ke ${maskEmail(targetEmail!)}.`,
      })
    } catch (err) {
      console.error('[POST /api/lms/auth/magic/send] email send error:', err)
      return jsonError(
        'Gagal kirim email. Coba lagi atau gunakan WA.',
        500,
      )
    }
  } catch (err) {
    if (err instanceof StudentMagicError) {
      return jsonError(err.message, err.code === 'THROTTLED' ? 429 : 400)
    }
    console.error('[POST /api/lms/auth/magic/send]', err)
    return jsonError('Gagal kirim link', 500)
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!user || !domain) return email
  if (user.length <= 2) return `${user[0]}***@${domain}`
  return `${user.slice(0, 2)}***@${domain}`
}
