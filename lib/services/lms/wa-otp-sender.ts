// LMS WA OTP delivery — kirim OTP plaintext ke phone student via WA.
//
// Pakai admin WA session (sama dgn pattern subscription notif) — cari
// session CONNECTED terbaru milik user role=ADMIN. Kalau gagal:
//   - Phase 2 BETA: log OTP plaintext ke server console (admin lihat
//     via docker logs supaya bisa test flow tanpa WA active)
//   - Tidak throw — student tetap dapat respons sukses dari API, dan
//     admin bisa kasih OTP manual via WA / chat lain
//
// Production: pastikan WA admin session selalu CONNECTED. Future Phase 4:
// dedicated WA bot khusus OTP + monitoring.
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

async function findAdminWaSessionId(): Promise<string | null> {
  const session = await prisma.whatsappSession.findFirst({
    where: {
      status: 'CONNECTED',
      user: { role: 'ADMIN' },
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  })
  return session?.id ?? null
}

const OTP_BRAND = 'Hulao Belajar'

function buildOtpMessage(otp: string): string {
  return [
    `*${OTP_BRAND}*`,
    '',
    `Kode OTP login portal kamu: *${otp}*`,
    'Berlaku 5 menit.',
    '',
    `Abaikan pesan ini kalau bukan kamu yg request.`,
  ].join('\n')
}

export interface SendOtpResult {
  delivered: boolean
  channel: 'WA' | 'CONSOLE_FALLBACK'
  reason?: string
}

export async function sendOtpViaWa(input: {
  studentPhone: string
  otpPlaintext: string
}): Promise<SendOtpResult> {
  const adminSessionId = await findAdminWaSessionId()
  if (!adminSessionId) {
    // Fallback: log plaintext OTP supaya admin bisa kasih manual via chat
    // lain (mis. WA pribadi). Phase 2 BETA acceptable — Phase 4 ganti dgn
    // dedicated bot.
    console.warn(
      `[lms-otp] WA admin session tidak CONNECTED — OTP untuk ${input.studentPhone}: ${input.otpPlaintext}`,
    )
    return {
      delivered: false,
      channel: 'CONSOLE_FALLBACK',
      reason: 'WA admin session tidak aktif',
    }
  }
  const text = buildOtpMessage(input.otpPlaintext)
  const send = await waService.sendMessage(
    adminSessionId,
    input.studentPhone,
    text,
  )
  if (!send.success) {
    console.warn(
      `[lms-otp] gagal kirim WA ke ${input.studentPhone}: ${send.error}; OTP: ${input.otpPlaintext}`,
    )
    return {
      delivered: false,
      channel: 'CONSOLE_FALLBACK',
      reason: send.error ?? 'Gagal kirim WA',
    }
  }
  return { delivered: true, channel: 'WA' }
}
