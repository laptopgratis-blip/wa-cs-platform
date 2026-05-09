// POST /api/lms/auth/verify
// Body: { phone, otp }
// Verify OTP, create StudentSession, set httpOnly cookie. Cookie akan
// dipakai untuk akses /belajar dan endpoint LMS public lain.
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import {
  STUDENT_COOKIE_NAME,
  StudentAuthError,
  verifyOtpAndCreateSession,
} from '@/lib/services/lms/student-auth'

const schema = z.object({
  phone: z.string().min(8).max(20),
  otp: z.string().min(4).max(8),
})

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Body tidak valid')

  // Capture user agent + IP untuk audit (best-effort).
  const userAgent = req.headers.get('user-agent') ?? undefined
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined

  try {
    const result = await verifyOtpAndCreateSession({
      phoneRaw: parsed.data.phone,
      otpPlain: parsed.data.otp,
      userAgent,
      ipAddress,
    })
    const res = Response.json({
      success: true,
      data: {
        studentPhone: result.studentPhone,
        expiresAt: result.expiresAt.toISOString(),
      },
    })
    // Cookie httpOnly + secure + sameSite=lax. Path=/ supaya available di
    // /belajar dan API endpoint.
    const maxAge = Math.floor(
      (result.expiresAt.getTime() - Date.now()) / 1000,
    )
    res.headers.append(
      'Set-Cookie',
      [
        `${STUDENT_COOKIE_NAME}=${result.sessionToken}`,
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        `Max-Age=${maxAge}`,
      ].join('; '),
    )
    return res
  } catch (err) {
    if (err instanceof StudentAuthError) {
      return jsonError(err.message, 400)
    }
    console.error('[POST /api/lms/auth/verify]', err)
    return jsonError('Gagal verify OTP', 500)
  }
}
