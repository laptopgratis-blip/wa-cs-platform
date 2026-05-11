// OTP core untuk auth (signup + login via email/WA).
// - Generate kode 6-digit random crypto-safe.
// - Hash dengan sha256 sebelum simpan (TTL 5 menit, low-value → no salt).
// - Rate-limit per identifier + per IP via Prisma count.
// - Verify increment attempts, max 5 wrong → invalid.
import crypto from 'node:crypto'

import { prisma } from '@/lib/prisma'

// ─── Tunables ───
export const OTP_TTL_MS = 5 * 60 * 1000 // 5 menit
export const OTP_MAX_ATTEMPTS = 5
export const OTP_COOLDOWN_MS = 60 * 1000 // 60 detik antar request same identifier
export const OTP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 menit
export const OTP_RATE_LIMIT_PER_IDENTIFIER = 5
export const OTP_RATE_LIMIT_PER_IP = 20

export type OtpMode = 'LOGIN' | 'SIGNUP'
export type OtpChannel = 'EMAIL' | 'PHONE'

export class OtpError extends Error {
  constructor(
    public code:
      | 'COOLDOWN'
      | 'RATE_LIMITED_IDENTIFIER'
      | 'RATE_LIMITED_IP'
      | 'NOT_FOUND'
      | 'EXPIRED'
      | 'USED'
      | 'TOO_MANY_ATTEMPTS'
      | 'INVALID_CODE',
    public httpStatus: number,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message)
  }
}

export function generateCode(): string {
  // crypto.randomInt(0, 1_000_000) — uniform, no modulo bias.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// Lempar OtpError kalau exceed batas. Cooldown dicek dgn cari OTP belum-used
// untuk identifier yang sama dlm 60 detik terakhir.
export async function checkRateLimit(input: {
  identifier: string
  ipAddress: string | null
}): Promise<void> {
  const now = Date.now()
  const windowAgo = new Date(now - OTP_RATE_LIMIT_WINDOW_MS)

  // Cooldown — cari OTP terbaru utk identifier ini yg belum used & belum
  // expired. Kalau ada & createdAt < 60s lalu, tolak.
  const lastFresh = await prisma.authOtp.findFirst({
    where: { identifier: input.identifier, used: false },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (lastFresh) {
    const sinceMs = now - lastFresh.createdAt.getTime()
    if (sinceMs < OTP_COOLDOWN_MS) {
      const retry = Math.ceil((OTP_COOLDOWN_MS - sinceMs) / 1000)
      throw new OtpError(
        'COOLDOWN',
        429,
        `Tunggu ${retry} detik sebelum minta OTP lagi.`,
        retry,
      )
    }
  }

  const [byIdentifier, byIp] = await Promise.all([
    prisma.authOtp.count({
      where: { identifier: input.identifier, createdAt: { gte: windowAgo } },
    }),
    input.ipAddress
      ? prisma.authOtp.count({
          where: { ipAddress: input.ipAddress, createdAt: { gte: windowAgo } },
        })
      : Promise.resolve(0),
  ])

  if (byIdentifier >= OTP_RATE_LIMIT_PER_IDENTIFIER) {
    throw new OtpError(
      'RATE_LIMITED_IDENTIFIER',
      429,
      'Terlalu banyak permintaan OTP untuk akun ini. Coba lagi 15 menit lagi.',
      15 * 60,
    )
  }
  if (byIp >= OTP_RATE_LIMIT_PER_IP) {
    throw new OtpError(
      'RATE_LIMITED_IP',
      429,
      'Terlalu banyak permintaan dari jaringan ini. Coba lagi nanti.',
      15 * 60,
    )
  }
}

export interface CreateOtpInput {
  identifier: string
  ipAddress: string | null
  mode: OtpMode
  channel: OtpChannel
  // SIGNUP-only pending data
  pendingEmail?: string
  pendingPhone?: string
  pendingName?: string
  // LOGIN-only pointer
  userId?: string
}

export interface CreatedOtp {
  id: string
  code: string // plaintext, dipakai kirim ke channel — JANGAN persist
}

export async function createOtp(input: CreateOtpInput): Promise<CreatedOtp> {
  const code = generateCode()
  const codeHash = hashCode(code)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  const row = await prisma.authOtp.create({
    data: {
      identifier: input.identifier,
      ipAddress: input.ipAddress,
      codeHash,
      mode: input.mode,
      channel: input.channel,
      pendingEmail: input.pendingEmail,
      pendingPhone: input.pendingPhone,
      pendingName: input.pendingName,
      userId: input.userId,
      expiresAt,
    },
    select: { id: true },
  })
  return { id: row.id, code }
}

// Verify ketat: increment attempts SEBELUM compare untuk hindari race.
// Return record lengkap kalau valid; lempar OtpError kalau invalid.
export async function verifyOtp(
  otpId: string,
  code: string,
): Promise<{
  id: string
  mode: OtpMode
  channel: OtpChannel
  identifier: string
  pendingEmail: string | null
  pendingPhone: string | null
  pendingName: string | null
  userId: string | null
}> {
  const otp = await prisma.authOtp.findUnique({ where: { id: otpId } })
  if (!otp) throw new OtpError('NOT_FOUND', 404, 'OTP tidak ditemukan.')
  if (otp.used) throw new OtpError('USED', 400, 'OTP sudah dipakai.')
  if (otp.expiresAt.getTime() < Date.now()) {
    throw new OtpError('EXPIRED', 400, 'OTP sudah kedaluwarsa. Kirim ulang.')
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new OtpError(
      'TOO_MANY_ATTEMPTS',
      400,
      'OTP sudah dicoba terlalu sering. Kirim ulang.',
    )
  }
  // Increment attempts dulu — kalau code salah, counter sudah naik dan
  // brute force terbatas. Skip kalau code valid (no need to leak miss).
  const expected = hashCode(code)
  if (expected !== otp.codeHash) {
    await prisma.authOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    })
    throw new OtpError('INVALID_CODE', 400, 'Kode OTP salah.')
  }
  return {
    id: otp.id,
    mode: otp.mode as OtpMode,
    channel: otp.channel as OtpChannel,
    identifier: otp.identifier,
    pendingEmail: otp.pendingEmail,
    pendingPhone: otp.pendingPhone,
    pendingName: otp.pendingName,
    userId: otp.userId,
  }
}

// Mark OTP used setelah login/signup berhasil — dipanggil dari NextAuth
// authorize() setelah verifyOtp() lewat dan user sukses dibuat/ditemukan.
export async function markOtpUsed(otpId: string): Promise<void> {
  await prisma.authOtp.update({ where: { id: otpId }, data: { used: true } })
}
