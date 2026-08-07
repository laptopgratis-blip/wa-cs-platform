// Kirim magic link login ke student via WA admin session.
//
// Mirror pattern wa-otp-sender.ts: cari WA session admin CONNECTED,
// fallback console warn kalau tidak ada. Caller (api / hook) yg decide
// apakah retry via email kalau delivered=false.
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

async function findAdminWaSessionId(): Promise<string | null> {
  const session = await prisma.whatsappSession.findFirst({
    where: { status: 'CONNECTED', user: { role: 'ADMIN' } },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  })
  return session?.id ?? null
}

const BRAND = 'Hulao Belajar'

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

export interface SendMagicLinkResult {
  delivered: boolean
  channel: 'WA'
  reason?: string
}

export async function sendMagicLinkViaWa(input: {
  studentPhone: string
  magicUrl: string
  courseTitle?: string
  studentName?: string | null
}): Promise<SendMagicLinkResult> {
  const adminSessionId = await findAdminWaSessionId()
  if (!adminSessionId) {
    console.warn(
      `[lms-magic] WA admin session tidak CONNECTED — magic link untuk ${input.studentPhone}: ${input.magicUrl}`,
    )
    return {
      delivered: false,
      channel: 'WA',
      reason: 'WA admin session tidak aktif',
    }
  }
  const text = buildMessage(input)
  const send = await waService.sendMessage(
    adminSessionId,
    input.studentPhone,
    text,
  )
  if (!send.success) {
    console.warn(
      `[lms-magic] gagal kirim WA ke ${input.studentPhone}:`,
      send.error,
    )
    return {
      delivered: false,
      channel: 'WA',
      reason: send.error ?? 'Gagal kirim WA',
    }
  }
  return { delivered: true, channel: 'WA' }
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
}): Promise<SendMagicLinkResult> {
  const adminSessionId = await findAdminWaSessionId()
  if (!adminSessionId) {
    console.warn(
      `[ebook-magic] WA admin session tidak CONNECTED — link akses untuk ${input.buyerPhone}: ${input.magicUrl}`,
    )
    return {
      delivered: false,
      channel: 'WA',
      reason: 'WA admin session tidak aktif',
    }
  }
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
  const send = await waService.sendMessage(
    adminSessionId,
    input.buyerPhone,
    text,
  )
  if (!send.success) {
    console.warn(
      `[ebook-magic] gagal kirim WA ke ${input.buyerPhone}:`,
      send.error,
    )
    return {
      delivered: false,
      channel: 'WA',
      reason: send.error ?? 'Gagal kirim WA',
    }
  }
  return { delivered: true, channel: 'WA' }
}
