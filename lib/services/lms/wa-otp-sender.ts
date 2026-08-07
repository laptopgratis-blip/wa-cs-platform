// LMS WA OTP delivery — kirim OTP plaintext ke phone student via WA.
//
// Pengirim dicari dari pool (lib/services/lms/wa-sender-pool.ts): sesi ADMIN
// platform dulu, lalu FALLBACK sesi PENJUAL yang berelasi dgn nomor student
// (2026-08-07: nomor admin diblokir permanen — tanpa fallback ini OTP mati
// total). Kalau semua gagal:
//   - Log OTP plaintext ke server console (admin lihat via docker logs
//     supaya bisa kasih OTP manual via chat lain)
//   - Tidak throw — student tetap dapat respons sukses dari API
import { waService } from '@/lib/wa-service'

import { findStudentWaSenders } from './wa-sender-pool'

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
  const senders = await findStudentWaSenders({
    studentPhone: input.studentPhone,
  })
  if (senders.length === 0) {
    // Fallback terakhir: log plaintext OTP supaya admin bisa kasih manual.
    console.warn(
      `[lms-otp] tidak ada sesi WA CONNECTED (admin/penjual) — OTP untuk ${input.studentPhone}: ${input.otpPlaintext}`,
    )
    return {
      delivered: false,
      channel: 'CONSOLE_FALLBACK',
      reason: 'Tidak ada sesi WA aktif (admin/penjual)',
    }
  }

  const text = buildOtpMessage(input.otpPlaintext)
  let lastError: string | undefined
  for (const sender of senders) {
    const send = await waService.sendMessage(
      sender.sessionId,
      input.studentPhone,
      text,
    )
    if (send.success) {
      if (sender.label === 'penjual') {
        console.warn(
          `[lms-otp] OTP terkirim via sesi PENJUAL (admin down) ke ${input.studentPhone}`,
        )
      }
      return { delivered: true, channel: 'WA' }
    }
    lastError = send.error ?? 'Gagal kirim WA'
    console.warn(
      `[lms-otp] gagal kirim via sesi ${sender.label} ke ${input.studentPhone}:`,
      send.error,
    )
  }

  console.warn(
    `[lms-otp] semua sesi gagal — OTP untuk ${input.studentPhone}: ${input.otpPlaintext}`,
  )
  return {
    delivered: false,
    channel: 'CONSOLE_FALLBACK',
    reason: lastError ?? 'Gagal kirim WA',
  }
}
