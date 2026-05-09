// LMS Student Auth — WA OTP login flow untuk pembeli course.
//
// Flow:
//   1. Student input phone → POST /api/lms/auth/request-otp
//      - normalize phone E.164
//      - throttle: max 3 OTP per phone / 60 menit
//      - generate 6-digit OTP, hash, simpan StudentOtp (expiresAt = now+5m)
//      - kirim OTP via WA bot (lib/services/wa-otp-sender.ts)
//   2. Student input OTP → POST /api/lms/auth/verify
//      - cek StudentOtp paling baru utk phone yg belum consumed
//      - timingSafe compare hash, increment attempts kalau salah
//      - max 5 attempts → mark consumed (force re-request)
//      - kalau match: mark consumed, generate StudentSession token, set cookie
//   3. Subsequent requests → cek cookie via getStudentFromCookie()
//
// Security:
//   - OTP plaintext NEVER disimpan, hanya hash sha256
//   - Throttle per phone (anti-spam) + per IP (Phase 4 nanti)
//   - sessionToken cryptographically random (32 byte hex)
//   - Cookie httpOnly + secure + sameSite=lax + 30 hari TTL
import crypto from 'node:crypto'

import { prisma } from '@/lib/prisma'

const OTP_TTL_MS = 5 * 60 * 1000 // 5 menit
const OTP_THROTTLE_WINDOW_MS = 60 * 60 * 1000 // 60 menit
const OTP_MAX_PER_WINDOW = 3
const OTP_MAX_VERIFY_ATTEMPTS = 5
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari

export const STUDENT_COOKIE_NAME = 'belajar-session'

// Normalize phone ke E.164 ID (628xxx). Idempotent.
export function normalizeStudentPhone(raw: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return `62${digits}`
}

function hashOtp(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex')
}

// Constant-time compare untuk hex string. Length sama (sha256 = 64).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export interface RequestOtpResult {
  ok: true
  otpId: string
  expiresAt: Date
  // Phone E.164 ter-normalisasi — caller pakai untuk kirim WA.
  studentPhone: string
  // Plaintext OTP — caller (api route) yg kirim via WA, JANGAN return ke client.
  otpPlaintext: string
}

export class StudentAuthError extends Error {
  constructor(
    message: string,
    public code:
      | 'INVALID_PHONE'
      | 'THROTTLED'
      | 'OTP_INVALID'
      | 'OTP_EXPIRED'
      | 'OTP_MAX_ATTEMPTS'
      | 'NO_PENDING_OTP',
  ) {
    super(message)
  }
}

// Issue OTP baru. Cek throttle. Caller (api route) terima otpPlaintext untuk
// dikirim via WA — TIDAK boleh return ke client.
export async function requestOtp(
  phoneRaw: string,
): Promise<RequestOtpResult> {
  const phone = normalizeStudentPhone(phoneRaw)
  if (!phone) throw new StudentAuthError('Nomor WA tidak valid', 'INVALID_PHONE')

  // Throttle: count OTP request dlm 60 menit terakhir untuk phone ini.
  const since = new Date(Date.now() - OTP_THROTTLE_WINDOW_MS)
  const recent = await prisma.studentOtp.count({
    where: {
      studentPhone: phone,
      createdAt: { gte: since },
    },
  })
  if (recent >= OTP_MAX_PER_WINDOW) {
    throw new StudentAuthError(
      `Terlalu banyak request OTP (max ${OTP_MAX_PER_WINDOW} per jam). Coba lagi nanti.`,
      'THROTTLED',
    )
  }

  // 6-digit numeric, leading-zero ok (tampak natural di WA).
  const plain = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  const row = await prisma.studentOtp.create({
    data: {
      studentPhone: phone,
      otpHash: hashOtp(plain),
      expiresAt,
    },
  })
  return {
    ok: true,
    otpId: row.id,
    expiresAt,
    studentPhone: phone,
    otpPlaintext: plain,
  }
}

export interface VerifyOtpResult {
  sessionToken: string
  studentPhone: string
  expiresAt: Date
}

// Verify OTP + create session. Caller harus set cookie dgn sessionToken.
export async function verifyOtpAndCreateSession(input: {
  phoneRaw: string
  otpPlain: string
  userAgent?: string
  ipAddress?: string
}): Promise<VerifyOtpResult> {
  const phone = normalizeStudentPhone(input.phoneRaw)
  if (!phone) throw new StudentAuthError('Nomor WA tidak valid', 'INVALID_PHONE')

  // Ambil OTP paling baru untuk phone ini yg belum consumed.
  const otp = await prisma.studentOtp.findFirst({
    where: { studentPhone: phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!otp) {
    throw new StudentAuthError(
      'Tidak ada OTP aktif. Request OTP baru.',
      'NO_PENDING_OTP',
    )
  }
  if (otp.expiresAt < new Date()) {
    throw new StudentAuthError('OTP expired. Request OTP baru.', 'OTP_EXPIRED')
  }
  if (otp.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    // Mark consumed supaya next attempt force re-request.
    await prisma.studentOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    })
    throw new StudentAuthError(
      'OTP di-block karena terlalu banyak percobaan salah. Request OTP baru.',
      'OTP_MAX_ATTEMPTS',
    )
  }

  const expectedHash = otp.otpHash
  const inputHash = hashOtp(input.otpPlain.trim())
  const match = timingSafeEqual(expectedHash, inputHash)

  if (!match) {
    await prisma.studentOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    })
    const remaining = OTP_MAX_VERIFY_ATTEMPTS - otp.attempts - 1
    throw new StudentAuthError(
      `OTP salah. Sisa ${Math.max(0, remaining)} percobaan.`,
      'OTP_INVALID',
    )
  }

  // Match — mark consumed + create session.
  await prisma.studentOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  })

  // Snapshot studentName/email dari Enrollment terbaru (kalau ada).
  const recentEnroll = await prisma.enrollment.findFirst({
    where: { studentPhone: phone },
    orderBy: { enrolledAt: 'desc' },
    select: { studentName: true, studentEmail: true },
  })

  const sessionToken = crypto.randomBytes(32).toString('hex')
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await prisma.studentSession.create({
    data: {
      studentPhone: phone,
      sessionToken,
      studentName: recentEnroll?.studentName ?? null,
      studentEmail: recentEnroll?.studentEmail ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt: sessionExpiresAt,
    },
  })
  return {
    sessionToken,
    studentPhone: phone,
    expiresAt: sessionExpiresAt,
  }
}

export interface StudentContext {
  sessionId: string
  studentPhone: string
  studentName: string | null
  studentEmail: string | null
}

// Resolve session dari cookie value (sessionToken). Update lastSeenAt
// best-effort. Return null kalau tidak valid / expired.
export async function getStudentFromSessionToken(
  sessionToken: string | undefined | null,
): Promise<StudentContext | null> {
  if (!sessionToken) return null
  const session = await prisma.studentSession.findUnique({
    where: { sessionToken },
    select: {
      id: true,
      studentPhone: true,
      studentName: true,
      studentEmail: true,
      expiresAt: true,
    },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) return null

  // Update lastSeenAt async — tidak block return.
  void prisma.studentSession
    .update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {})

  return {
    sessionId: session.id,
    studentPhone: session.studentPhone,
    studentName: session.studentName,
    studentEmail: session.studentEmail,
  }
}

export async function destroySession(sessionToken: string): Promise<void> {
  await prisma.studentSession
    .delete({ where: { sessionToken } })
    .catch(() => {})
}
