// Kirim magic link login student via WA.
//
// Pengirim dicari dari pool (wa-sender-pool.ts): sesi ADMIN platform dulu,
// lalu FALLBACK sesi PENJUAL yang berelasi dgn nomor student (2026-08-07:
// nomor admin diblokir permanen — tanpa fallback ini magic link course &
// e-book mati total padahal WA penjual hidup). Caller (api / hook) yang
// decide apakah retry via email kalau delivered=false.
import { waService } from '@/lib/wa-service'

import {
  findStudentWaSenders,
  type WaSenderCandidate,
} from './wa-sender-pool'

const BRAND = 'Hulao Belajar'

export interface SendMagicLinkResult {
  delivered: boolean
  channel: 'WA'
  reason?: string
}

// Loop kandidat pengirim sampai satu berhasil. Dipakai kedua varian pesan.
async function sendViaPool(input: {
  senders: WaSenderCandidate[]
  phone: string
  text: string
  logTag: string
}): Promise<SendMagicLinkResult> {
  if (input.senders.length === 0) {
    console.warn(
      `[${input.logTag}] tidak ada sesi WA CONNECTED (admin/penjual) untuk ${input.phone}`,
    )
    return {
      delivered: false,
      channel: 'WA',
      reason: 'Tidak ada sesi WA aktif (admin/penjual)',
    }
  }
  let lastError: string | undefined
  for (const sender of input.senders) {
    const send = await waService.sendMessage(
      sender.sessionId,
      input.phone,
      input.text,
    )
    if (send.success) {
      if (sender.label === 'penjual') {
        console.warn(
          `[${input.logTag}] terkirim via sesi PENJUAL (admin down) ke ${input.phone}`,
        )
      }
      return { delivered: true, channel: 'WA' }
    }
    lastError = send.error ?? 'Gagal kirim WA'
    console.warn(
      `[${input.logTag}] gagal kirim via sesi ${sender.label} ke ${input.phone}:`,
      send.error,
    )
  }
  return { delivered: false, channel: 'WA', reason: lastError }
}

function buildMessage(input: {
  magicUrl: string
  courseTitle?: string
  studentName?: string | null
}): string {
  const greet = input.studentName ? `Halo ${input.studentName}!` : 'Halo!'
  const intro = input.courseTitle
    ? `Akses *${input.courseTitle}* sudah aktif untuk kamu.`
    : `Akses portal belajar kamu sudah siap.`
  return [
    `*${BRAND}*`,
    '',
    greet,
    intro,
    '',
    `Klik link berikut untuk langsung masuk (tanpa OTP):`,
    input.magicUrl,
    '',
    `Link berlaku 90 hari, simpan/bookmark supaya bisa pakai lagi nanti.`,
    `Kalau link bermasalah, login manual di hulao.id/belajar pakai nomor WA ini.`,
    '',
    `_— ${BRAND}_`,
  ].join('\n')
}

export async function sendMagicLinkViaWa(input: {
  studentPhone: string
  magicUrl: string
  courseTitle?: string
  studentName?: string | null
  // Pemilik course (hook order tahu ini) — diprioritaskan sebagai fallback
  // pertama setelah admin. Kalau kosong (resend student-driven), penjual
  // dicari dari relasi enrollment/entitlement nomor tsb.
  sellerUserId?: string
}): Promise<SendMagicLinkResult> {
  const senders = await findStudentWaSenders({
    studentPhone: input.studentPhone,
    sellerUserId: input.sellerUserId,
  })
  return sendViaPool({
    senders,
    phone: input.studentPhone,
    text: buildMessage(input),
    logTag: 'lms-magic',
  })
}

// Varian pesan untuk akses E-BOOK (2026-08-06) — link auto-login yang sama
// (/belajar/auto), tapi body menyebut judul e-book + info jatah download &
// masa aktif supaya pembeli tahu batasannya sejak awal.
export async function sendEbookAccessViaWa(input: {
  buyerPhone: string
  buyerName: string | null
  magicUrl: string
  ebookTitle: string
  maxDownloads: number
  expiresAt: Date | null
  // Pemilik e-book — fallback pertama setelah admin.
  sellerUserId: string
}): Promise<SendMagicLinkResult> {
  const greet = input.buyerName ? `Halo ${input.buyerName}!` : 'Halo!'
  const masaAktif = input.expiresAt
    ? `berlaku s.d. ${input.expiresAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : 'berlaku selamanya'
  const text = [
    `*Akses E-Book Aktif 📚*`,
    '',
    greet,
    `Pembayaran kamu untuk e-book *${input.ebookTitle}* sudah dikonfirmasi.`,
    '',
    `Klik link berikut untuk buka Perpustakaan & download (tanpa OTP):`,
    input.magicUrl,
    '',
    `Jatah download: ${input.maxDownloads}x, akses ${masaAktif}.`,
    `Kalau link bermasalah, login manual di hulao.id/belajar pakai nomor WA ini.`,
    '',
    `_— ${BRAND}_`,
  ].join('\n')

  const senders = await findStudentWaSenders({
    studentPhone: input.buyerPhone,
    sellerUserId: input.sellerUserId,
  })
  return sendViaPool({
    senders,
    phone: input.buyerPhone,
    text,
    logTag: 'ebook-magic',
  })
}
