// LMS Magic Link login — alternatif OTP yg lebih tahan WA disconnect.
//
// Flow:
//   1. Saat enrollment auto-flow on-PAID, atau manual resend lewat
//      /api/lms/auth/magic/send → issueMagicLink().
//   2. Service revoke token aktif lama untuk phone yg sama, create token
//      baru random 32-byte, simpan StudentMagicLink (TTL 90 hari).
//   3. Caller kirim URL `${APP_URL}/belajar/auto?t=${token}` via WA / Email.
//   4. Klik URL → server route consumeMagicLink() → cek valid → create
//      StudentSession baru → set cookie → redirect ke /belajar.
//
// Token tetap multi-use sampai expiresAt — student bisa simpan/bookmark.
// Tiap klik increment useCount untuk audit. Kalau bocor, mitigasi: issue
// magic link baru → token lama auto-revoked.
import crypto from 'node:crypto'

import { prisma } from '@/lib/prisma'

import { normalizeStudentPhone } from './student-auth'

export const MAGIC_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 hari
const MAGIC_THROTTLE_WINDOW_MS = 60 * 60 * 1000 // 60 menit
const MAGIC_MAX_PER_WINDOW = 3
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari (mirror OTP session)

export type MagicChannel = 'WA' | 'EMAIL'
export type MagicTrigger = 'ENROLLMENT' | 'RESEND'

export class StudentMagicError extends Error {
  constructor(
    message: string,
    public code:
      | 'INVALID_PHONE'
      | 'THROTTLED'
      | 'TOKEN_INVALID'
      | 'TOKEN_EXPIRED'
      | 'TOKEN_REVOKED',
  ) {
    super(message)
  }
}

export interface IssuedMagicLink {
  id: string
  token: string
  studentPhone: string
  expiresAt: Date
  // URL siap kirim — caller pakai langsung di body WA / email.
  url: string
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://hulao.id'
}

function buildMagicUrl(token: string): string {
  return `${appUrl()}/belajar/auto?t=${encodeURIComponent(token)}`
}

// Issue token magic link. Caller (api / hook) bertanggung jawab kirim ke
// student via channel yg dipilih. `phoneRaw` di-normalize internally.
//
// Side effect: revoke token aktif lama untuk phone ini supaya hanya 1 token
// "live" per phone — kalau token lama bocor, issue baru otomatis invalidate.
//
// `skipThrottle` true hanya untuk trigger=ENROLLMENT (sistem-issued, bukan
// user-driven). Trigger=RESEND selalu di-throttle utk anti-spam.
export async function issueMagicLink(input: {
  phoneRaw: string
  channel: MagicChannel
  trigger: MagicTrigger
  skipThrottle?: boolean
}): Promise<IssuedMagicLink> {
  const phone = normalizeStudentPhone(input.phoneRaw)
  if (!phone)
    throw new StudentMagicError('Nomor WA tidak valid', 'INVALID_PHONE')

  if (!input.skipThrottle) {
    const since = new Date(Date.now() - MAGIC_THROTTLE_WINDOW_MS)
    const recent = await prisma.studentMagicLink.count({
      where: { studentPhone: phone, createdAt: { gte: since } },
    })
    if (recent >= MAGIC_MAX_PER_WINDOW) {
      throw new StudentMagicError(
        `Terlalu banyak request (max ${MAGIC_MAX_PER_WINDOW} per jam). Coba lagi nanti.`,
        'THROTTLED',
      )
    }
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + MAGIC_TOKEN_TTL_MS)
  const now = new Date()

  // Atomic: revoke active tokens + create new dalam 1 transaction.
  const created = await prisma.$transaction(async (tx) => {
    await tx.studentMagicLink.updateMany({
      where: {
        studentPhone: phone,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    })
    return tx.studentMagicLink.create({
      data: {
        studentPhone: phone,
        token,
        expiresAt,
        channel: input.channel,
        trigger: input.trigger,
      },
    })
  })

  return {
    id: created.id,
    token: created.token,
    studentPhone: phone,
    expiresAt: created.expiresAt,
    url: buildMagicUrl(created.token),
  }
}

export interface ConsumeMagicLinkResult {
  sessionToken: string
  studentPhone: string
  expiresAt: Date
}

// Consume token: cek valid + create StudentSession baru. Multi-use — token
// tetap valid sampai expiresAt selama tidak revoked. Tiap klik = session baru.
//
// `userAgent` dan `ipAddress` opsional (audit di StudentSession).
export async function consumeMagicLink(input: {
  token: string
  userAgent?: string
  ipAddress?: string
}): Promise<ConsumeMagicLinkResult> {
  if (!input.token || typeof input.token !== 'string') {
    throw new StudentMagicError('Token tidak valid', 'TOKEN_INVALID')
  }

  const link = await prisma.studentMagicLink.findUnique({
    where: { token: input.token },
  })
  if (!link) {
    throw new StudentMagicError(
      'Link tidak valid atau sudah dicabut. Request akses ulang.',
      'TOKEN_INVALID',
    )
  }
  if (link.revokedAt) {
    throw new StudentMagicError(
      'Link sudah dicabut karena ada link baru. Cek pesan WA/Email terbaru.',
      'TOKEN_REVOKED',
    )
  }
  if (link.expiresAt < new Date()) {
    throw new StudentMagicError(
      'Link expired. Request akses ulang.',
      'TOKEN_EXPIRED',
    )
  }

  const isFirstUse = link.consumedAt === null
  await prisma.studentMagicLink.update({
    where: { id: link.id },
    data: {
      useCount: { increment: 1 },
      consumedAt: isFirstUse ? new Date() : link.consumedAt,
    },
  })

  // Snapshot studentName/email dari Enrollment terbaru — supaya StudentSession
  // langsung punya display name (mirror flow OTP verify).
  const recentEnroll = await prisma.enrollment.findFirst({
    where: { studentPhone: link.studentPhone },
    orderBy: { enrolledAt: 'desc' },
    select: { studentName: true, studentEmail: true },
  })

  const sessionToken = crypto.randomBytes(32).toString('hex')
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await prisma.studentSession.create({
    data: {
      studentPhone: link.studentPhone,
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
    studentPhone: link.studentPhone,
    expiresAt: sessionExpiresAt,
  }
}

// Lookup email "terbaik" untuk phone — dipakai saat user request resend
// lewat email tapi tidak input email manual.
//
// Prioritas: studentEmail di Enrollment terbaru → studentEmail di
// StudentSession terbaru → null (user harus input email manual).
export async function findStudentEmailByPhone(
  phoneRaw: string,
): Promise<string | null> {
  const phone = normalizeStudentPhone(phoneRaw)
  if (!phone) return null
  const enroll = await prisma.enrollment.findFirst({
    where: { studentPhone: phone, studentEmail: { not: null } },
    orderBy: { enrolledAt: 'desc' },
    select: { studentEmail: true },
  })
  if (enroll?.studentEmail) return enroll.studentEmail
  const session = await prisma.studentSession.findFirst({
    where: { studentPhone: phone, studentEmail: { not: null } },
    orderBy: { lastSeenAt: 'desc' },
    select: { studentEmail: true },
  })
  return session?.studentEmail ?? null
}
