// POST /api/auth/otp/request
// Body sesuai otpRequestSchema (LOGIN atau SIGNUP).
//
// LOGIN: lookup user by email atau phone, kirim OTP ke kedua channel
// kalau user punya.
// SIGNUP: validate uniqueness (email & phone belum dipakai), simpan data
// pending di AuthOtp, kirim OTP. User row baru dibuat saat verify lewat
// NextAuth 'otp' provider.
//
// Anti-spam: rate-limit per identifier + per IP, plus cooldown 60s antar
// request.
import { jsonError, jsonOk } from '@/lib/api'
import { createOtp, OtpError, checkRateLimit } from '@/lib/otp/auth-otp'
import { maskEmail, maskPhone, normalizePhone } from '@/lib/phone'
import { prisma } from '@/lib/prisma'
import { sendOtpDual } from '@/lib/services/auth-otp-sender'
import { OTP_COOLDOWN_MS } from '@/lib/otp/auth-otp'
import { otpRequestSchema } from '@/lib/validations/auth'

function getIp(req: Request): string | null {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() ?? null
  const real = req.headers.get('x-real-ip')
  return real ?? null
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = otpRequestSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? 'Input tidak valid',
      400,
    )
  }

  const ip = getIp(req)
  const input = parsed.data

  try {
    if (input.mode === 'SIGNUP') {
      const { name, email, phone } = input.signup
      // Uniqueness check — kasih pesan jelas supaya user tau kalau
      // sudah punya akun, dia ke /login bukan retry signup.
      const conflict = await prisma.user.findFirst({
        where: { OR: [{ email }, { phoneNumber: phone }] },
        select: { id: true, email: true, phoneNumber: true },
      })
      if (conflict) {
        const msg =
          conflict.email === email
            ? 'Email sudah terdaftar — silakan login.'
            : 'Nomor WhatsApp sudah terdaftar — silakan login.'
        return jsonError(msg, 409)
      }

      // Identifier untuk rate-limit = email (signup flow). Cooldown
      // berbasis ini supaya user gak bisa spam email untuk dua channel
      // berbeda.
      await checkRateLimit({ identifier: email, ipAddress: ip })

      const { id: otpId, code } = await createOtp({
        identifier: email,
        ipAddress: ip,
        mode: 'SIGNUP',
        channel: input.channel,
        pendingEmail: email,
        pendingPhone: phone,
        pendingName: name,
      })

      const result = await sendOtpDual({
        email,
        phone,
        code,
        mode: 'SIGNUP',
      })
      await prisma.authOtp.update({
        where: { id: otpId },
        data: {
          emailSent: result.emailSent,
          waSent: result.waSent,
          waError: result.waError ?? result.emailError ?? null,
        },
      })

      return jsonOk({
        otpId,
        sentTo: {
          email: maskEmail(email),
          phone: maskPhone(phone),
        },
        emailDelivered: result.emailSent,
        waDelivered: result.waSent,
        cooldownSec: Math.ceil(OTP_COOLDOWN_MS / 1000),
      })
    }

    // LOGIN ─────────────────────────────────────────
    // Normalize identifier sesuai channel. Kalau channel=PHONE, anggap
    // input phone; kalau EMAIL, anggap email (lowercase).
    let lookupWhere
    let identifierForRateLimit: string
    if (input.channel === 'PHONE') {
      const phone = normalizePhone(input.identifier)
      if (!phone) {
        return jsonError(
          'Format nomor WA tidak valid (contoh: 08123456789)',
          400,
        )
      }
      lookupWhere = { phoneNumber: phone }
      identifierForRateLimit = phone
    } else {
      const email = input.identifier.trim().toLowerCase()
      lookupWhere = { email }
      identifierForRateLimit = email
    }

    const user = await prisma.user.findFirst({
      where: lookupWhere,
      select: { id: true, email: true, phoneNumber: true },
    })
    if (!user) {
      return jsonError('Akun tidak ditemukan. Daftar dulu di /register.', 404)
    }

    await checkRateLimit({ identifier: identifierForRateLimit, ipAddress: ip })

    const { id: otpId, code } = await createOtp({
      identifier: identifierForRateLimit,
      ipAddress: ip,
      mode: 'LOGIN',
      channel: input.channel,
      userId: user.id,
    })

    const result = await sendOtpDual({
      email: user.email,
      phone: user.phoneNumber,
      code,
      mode: 'LOGIN',
    })
    await prisma.authOtp.update({
      where: { id: otpId },
      data: {
        emailSent: result.emailSent,
        waSent: result.waSent,
        waError: result.waError ?? result.emailError ?? null,
      },
    })

    return jsonOk({
      otpId,
      sentTo: {
        email: maskEmail(user.email),
        phone: user.phoneNumber ? maskPhone(user.phoneNumber) : null,
      },
      emailDelivered: result.emailSent,
      waDelivered: result.waSent,
      cooldownSec: Math.ceil(OTP_COOLDOWN_MS / 1000),
    })
  } catch (err) {
    if (err instanceof OtpError) {
      return jsonError(err.message, err.httpStatus)
    }
    console.error('[POST /api/auth/otp/request] gagal:', err)
    return jsonError('Gagal mengirim OTP. Coba lagi.', 500)
  }
}
