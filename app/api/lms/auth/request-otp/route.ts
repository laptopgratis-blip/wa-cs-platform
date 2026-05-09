// POST /api/lms/auth/request-otp
// Body: { phone: string }
// Throttle: max 3 OTP per phone / 60 menit (di service).
// Generate OTP 6-digit, simpan hash, kirim plaintext ke WA. Plaintext
// TIDAK di-return ke client.
//
// Public endpoint — TIDAK butuh student session (memang flow login).
// Tapi kasih hint "delivery channel" supaya UI bisa tampilkan info kalau
// WA fallback ke console (Phase 2 BETA).
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { StudentAuthError, requestOtp } from '@/lib/services/lms/student-auth'
import { sendOtpViaWa } from '@/lib/services/lms/wa-otp-sender'

const schema = z.object({ phone: z.string().min(8).max(20) })

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Nomor WA wajib diisi')

  try {
    const result = await requestOtp(parsed.data.phone)

    // Kirim WA — best-effort, tetap return success ke client kalau gagal
    // (admin akan tahu dari log + bisa kasih OTP manual).
    const send = await sendOtpViaWa({
      studentPhone: result.studentPhone,
      otpPlaintext: result.otpPlaintext,
    }).catch(() => ({
      delivered: false,
      channel: 'CONSOLE_FALLBACK' as const,
    }))

    return jsonOk({
      ok: true,
      expiresAt: result.expiresAt.toISOString(),
      // Hanya kirim flag delivery — tidak ada plaintext OTP.
      deliveryChannel: send.delivered ? 'WA' : 'CONSOLE_FALLBACK',
      // Pesan friendly untuk UI:
      message: send.delivered
        ? 'OTP terkirim via WhatsApp. Cek pesan masuk.'
        : 'OTP di-generate. Hubungi admin kalau tidak menerima WA dlm 1 menit.',
    })
  } catch (err) {
    if (err instanceof StudentAuthError) {
      return jsonError(err.message, err.code === 'THROTTLED' ? 429 : 400)
    }
    console.error('[POST /api/lms/auth/request-otp]', err)
    return jsonError('Gagal request OTP', 500)
  }
}
