// Service token download e-book — request (dari portal, ber-sesi) dan
// consume (public by-token, dipanggil route streaming).
//
// Aturan:
// - Token TTL 15 menit, SEKALI-HITUNG: downloadCount naik hanya saat
//   transisi consumedAt null→terisi. GET ulang / Range resume dalam TTL
//   memakai token yang sama tanpa menghitung dobel (download manager
//   mengirim multi-range).
// - expiresAt entitlement dicek EKSPLISIT di sini (lazy expire) — TIDAK ada
//   cron expiry; jangan berasumsi status EXPIRED sudah ter-set.
// - Batas download di-enforce TRANSAKSIONAL (updateMany bersyarat
//   downloadCount < maxDownloads) — anti race download paralel.
import { randomBytes } from 'crypto'

import { prisma } from '@/lib/prisma'

// TTL token pendek — cukup untuk mulai download + resume; token bearer
// (siapa pun yang pegang bisa pakai) jadi jangan berumur panjang.
const TOKEN_TTL_MS = 15 * 60 * 1000

export type DownloadDenyCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'REVOKED'
  | 'EXPIRED'
  | 'LIMIT'
  | 'TOKEN_EXPIRED'

export interface RequestTokenResult {
  ok: boolean
  code?: DownloadDenyCode
  message?: string
  url?: string
  expiresAt?: Date
  remaining?: number
}

async function logDownload(
  entitlementId: string,
  status: string,
  meta: { tokenId?: string | null; ipAddress?: string | null; userAgent?: string | null },
): Promise<void> {
  await prisma.ebookDownloadLog
    .create({
      data: {
        entitlementId,
        tokenId: meta.tokenId ?? null,
        status,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    })
    .catch(() => {}) // audit best-effort — jangan gagalkan flow utama
}

// Lazy expire: entitlement ACTIVE yang expiresAt-nya lewat di-set EXPIRED
// saat disentuh. Return true kalau (setelah cek) entitlement sudah expired.
async function lazyExpireIfNeeded(ent: {
  id: string
  status: string
  expiresAt: Date | null
}): Promise<boolean> {
  if (ent.status !== 'ACTIVE') return false
  if (!ent.expiresAt || ent.expiresAt.getTime() > Date.now()) return false
  await prisma.ebookEntitlement
    .updateMany({
      where: { id: ent.id, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    })
    .catch(() => {})
  return true
}

// Minta token download — dipanggil endpoint ber-sesi portal /belajar.
// studentPhone = identitas dari cookie belajar-session; WAJIB match
// buyerPhone entitlement (anti akses lintas nomor).
export async function requestDownloadToken(input: {
  entitlementId: string
  studentPhone: string
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<RequestTokenResult> {
  const ent = await prisma.ebookEntitlement.findUnique({
    where: { id: input.entitlementId },
    select: {
      id: true,
      buyerPhone: true,
      status: true,
      expiresAt: true,
      downloadCount: true,
      maxDownloads: true,
    },
  })
  if (!ent) return { ok: false, code: 'NOT_FOUND', message: 'Akses tidak ditemukan' }
  if (ent.buyerPhone !== input.studentPhone) {
    return { ok: false, code: 'FORBIDDEN', message: 'Akses bukan milik akun ini' }
  }

  if (await lazyExpireIfNeeded(ent)) {
    await logDownload(ent.id, 'DENIED_EXPIRED', input)
    return { ok: false, code: 'EXPIRED', message: 'Masa akses e-book sudah berakhir' }
  }
  if (ent.status === 'REVOKED') {
    await logDownload(ent.id, 'DENIED_REVOKED', input)
    return { ok: false, code: 'REVOKED', message: 'Akses e-book sudah dicabut' }
  }
  if (ent.status !== 'ACTIVE') {
    await logDownload(ent.id, 'DENIED_EXPIRED', input)
    return { ok: false, code: 'EXPIRED', message: 'Masa akses e-book sudah berakhir' }
  }
  if (ent.downloadCount >= ent.maxDownloads) {
    await logDownload(ent.id, 'DENIED_LIMIT', input)
    return {
      ok: false,
      code: 'LIMIT',
      message: `Batas download habis (${ent.maxDownloads}x). Hubungi penjual untuk tambahan akses.`,
    }
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
  await prisma.ebookDownloadToken.create({
    data: {
      token,
      entitlementId: ent.id,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
    },
  })
  return {
    ok: true,
    url: `/api/ebook/download/${token}`,
    expiresAt,
    remaining: ent.maxDownloads - ent.downloadCount,
  }
}

export interface ConsumeTokenResult {
  ok: boolean
  httpStatus?: number
  message?: string
  file?: {
    filePath: string
    fileName: string
    fileFormat: 'PDF' | 'EPUB'
    fileSizeBytes: number
  }
}

// Error internal untuk rollback klaim saat limit habis (race paralel).
class DownloadLimitError extends Error {}

// Validasi token + klaim sekali-hitung. Dipanggil route streaming.
export async function consumeDownloadToken(
  tokenStr: string,
  meta: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ConsumeTokenResult> {
  const tok = await prisma.ebookDownloadToken.findUnique({
    where: { token: tokenStr },
    select: {
      id: true,
      expiresAt: true,
      consumedAt: true,
      entitlement: {
        select: {
          id: true,
          status: true,
          expiresAt: true,
          maxDownloads: true,
          ebook: {
            select: {
              filePath: true,
              fileName: true,
              fileFormat: true,
              fileSizeBytes: true,
            },
          },
        },
      },
    },
  })
  if (!tok || !tok.entitlement?.ebook) {
    return { ok: false, httpStatus: 404, message: 'Link download tidak valid' }
  }
  const ent = tok.entitlement

  if (tok.expiresAt.getTime() < Date.now()) {
    await logDownload(ent.id, 'DENIED_EXPIRED', { ...meta, tokenId: tok.id })
    return {
      ok: false,
      httpStatus: 410,
      message: 'Link download kedaluwarsa — minta link baru dari Perpustakaan',
    }
  }
  if (await lazyExpireIfNeeded(ent)) {
    await logDownload(ent.id, 'DENIED_EXPIRED', { ...meta, tokenId: tok.id })
    return { ok: false, httpStatus: 403, message: 'Masa akses e-book sudah berakhir' }
  }
  if (ent.status === 'REVOKED') {
    await logDownload(ent.id, 'DENIED_REVOKED', { ...meta, tokenId: tok.id })
    return { ok: false, httpStatus: 403, message: 'Akses e-book sudah dicabut' }
  }
  if (ent.status !== 'ACTIVE') {
    await logDownload(ent.id, 'DENIED_EXPIRED', { ...meta, tokenId: tok.id })
    return { ok: false, httpStatus: 403, message: 'Masa akses e-book sudah berakhir' }
  }

  // Klaim sekali-hitung: hanya saat consumedAt masih null. Kalau sudah
  // terisi (Range resume dalam TTL) → stream tanpa increment & tanpa log.
  if (tok.consumedAt === null) {
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.ebookDownloadToken.updateMany({
          where: { id: tok.id, consumedAt: null },
          data: { consumedAt: new Date() },
        })
        // Race dua request pertama token yg sama: yang kalah klaim skip
        // increment (yang menang sudah menghitung).
        if (claimed.count === 0) return
        const inc = await tx.ebookEntitlement.updateMany({
          where: {
            id: ent.id,
            status: 'ACTIVE',
            downloadCount: { lt: ent.maxDownloads },
          },
          data: { downloadCount: { increment: 1 } },
        })
        // Limit keburu habis oleh download paralel → rollback klaim token.
        if (inc.count === 0) throw new DownloadLimitError()
        await tx.ebookDownloadLog.create({
          data: {
            entitlementId: ent.id,
            tokenId: tok.id,
            status: 'SUCCESS',
            ipAddress: meta.ipAddress ?? null,
            userAgent: meta.userAgent ?? null,
          },
        })
      })
    } catch (err) {
      if (err instanceof DownloadLimitError) {
        await logDownload(ent.id, 'DENIED_LIMIT', { ...meta, tokenId: tok.id })
        return { ok: false, httpStatus: 403, message: 'Batas download habis' }
      }
      throw err
    }
  }

  return {
    ok: true,
    file: {
      filePath: ent.ebook.filePath,
      fileName: ent.ebook.fileName,
      fileFormat: ent.ebook.fileFormat,
      fileSizeBytes: ent.ebook.fileSizeBytes,
    },
  }
}
