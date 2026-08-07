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
//
// Pengirim (2026-08-07): coba sesi WA ADMIN platform dulu; kalau tidak ada /
// gagal, FALLBACK ke sesi WA PENJUAL (sellerUserId — pemilik e-book). Kasus
// nyata INV-20260807-L6Y31R: semua sesi admin ERROR → link tidak sampai,
// padahal WA penjual hidup (follow-up-nya terkirim).
export async function sendEbookAccessViaWa(input: {
  buyerPhone: string
  buyerName: string | null
  magicUrl: string
  ebookTitle: string
  maxDownloads: number
  expiresAt: Date | null
  // Pemilik e-book — sesi WA-nya jadi pengirim cadangan.
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

  // Kandidat pengirim berurutan: admin platform → penjual. Fallback penjual
  // selalu disiapkan — dipakai hanya kalau admin tidak ada / gagal kirim.
  const adminSessionId = await findAdminWaSessionId()
  const senders: Array<{ label: string; sessionId: string }> = []
  if (adminSessionId) senders.push({ label: 'admin', sessionId: adminSessionId })
  const sellerSession = await prisma.whatsappSession.findFirst({
    where: { userId: input.sellerUserId, status: 'CONNECTED' },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  })
  if (sellerSession && sellerSession.id !== adminSessionId) {
    senders.push({ label: 'penjual', sessionId: sellerSession.id })
  }

  if (senders.length === 0) {
    console.warn(
      `[ebook-magic] tidak ada sesi WA CONNECTED (admin maupun penjual) — link akses untuk ${input.buyerPhone}: ${input.magicUrl}`,
    )
    return {
      delivered: false,
      channel: 'WA',
      reason: 'Tidak ada sesi WA aktif (admin/penjual)',
    }
  }

  let lastError: string | undefined
  for (const sender of senders) {
    const send = await waService.sendMessage(
      sender.sessionId,
      input.buyerPhone,
      text,
    )
    if (send.success) {
      if (sender.label === 'penjual') {
        console.warn(
          `[ebook-magic] terkirim via sesi PENJUAL (admin down) ke ${input.buyerPhone}`,
        )
      }
      return { delivered: true, channel: 'WA' }
    }
    lastError = send.error ?? 'Gagal kirim WA'
    console.warn(
      `[ebook-magic] gagal kirim via sesi ${sender.label} ke ${input.buyerPhone}:`,
      send.error,
    )
  }
  return { delivered: false, channel: 'WA', reason: lastError }
}
