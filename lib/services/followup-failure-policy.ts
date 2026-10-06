// Kebijakan gagal kirim follow-up (cron followup-send) — PURE.
// Memutuskan RETRY / FAIL_FINAL / SKIP dari hasil smartSend, plus isi
// notifikasi in-app untuk seller saat gagal final. Dulu NO_TEMPLATE diulang
// 12x (~6 jam) lalu FAILED senyap dengan alasan generik; kini gagal permanen
// langsung final dan seller diberi tahu apa yang harus diperbaiki.

import type { SmartSendCode } from '@/lib/services/wa-send/smart-send'

export const MAX_SEND_RETRY = 3 // gagal transmisi WA
// Sesi WA tidak CONNECTED / template belum siap → tunda 30 menit per retry.
// 12x ≈ window 6 jam (kasus prod 2026-07-16: owner reconnect lebih lambat).
export const MAX_WA_RETRY = 12
export const RETRY_BACKOFF_MS = 15 * 60 * 1000
export const WA_RECONNECT_BACKOFF_MS = 30 * 60 * 1000

export const FOLLOWUP_FAILURE_NOTIF_TYPE = 'FOLLOWUP_SEND_FAILED'
const MAX_REASON_CHARS = 400

/**
 * Lingkup penyebab gagal final — menentukan isi & link notifikasi seller:
 * TEMPLATE  = konfigurasi follow-up/Template Meta (semua kiriman berikutnya ikut gagal)
 * SENDER    = nomor pengirim tidak terhubung (semua follow-up tertahan)
 * CREDIT    = saldo Kredit Pesan habis
 * CUSTOMER  = khusus satu pelanggan/pesanan (data kosong) — tanpa notifikasi
 * OTHER     = gagal transmisi generik setelah retry habis
 */
export type FollowUpFailureScope = 'TEMPLATE' | 'SENDER' | 'CREDIT' | 'CUSTOMER' | 'OTHER'

export interface FollowUpFailureInput {
  code?: SmartSendCode
  permanent?: boolean
  detail?: string
  error?: string
  /**
   * Placeholder peta variabel yang nilainya kosong untuk item ini (mis.
   * `{resi}` belum diisi) saat Meta/payload menolak jumlah parameter.
   */
  missingData?: string[]
  retryCount: number
}

export type FollowUpFailureDecision =
  | { action: 'RETRY'; reason: string; backoffMs: number }
  | { action: 'FAIL_FINAL'; reason: string; scope: FollowUpFailureScope }
  | { action: 'SKIP'; reason: string }

// Akhiran alasan transient ("... — follow-up dicoba lagi otomatis") tidak
// boleh terbawa ke status FAILED: seller akan menunggu retry yang tak datang.
const TRANSIENT_SUFFIX = /\s*—\s*(follow-up\s+)?dicoba lagi otomatis\s*$/

function pickReason(input: FollowUpFailureInput, fallback: string): string {
  return input.detail || input.error || fallback
}

function exhaustedReason(reason: string, maxRetry: number): string {
  return `${reason.replace(TRANSIENT_SUFFIX, '')} — batas ${maxRetry}x percobaan habis, follow-up dibatalkan`
}

function retryOrFail(
  input: FollowUpFailureInput,
  reason: string,
  opts: { maxRetry: number; backoffMs: number; scope: FollowUpFailureScope },
): FollowUpFailureDecision {
  if (input.permanent) return { action: 'FAIL_FINAL', reason, scope: opts.scope }
  if (input.retryCount >= opts.maxRetry) {
    return { action: 'FAIL_FINAL', reason: exhaustedReason(reason, opts.maxRetry), scope: opts.scope }
  }
  return { action: 'RETRY', reason, backoffMs: opts.backoffMs }
}

/** Placeholder peta yang nilainya kosong (unik, urut kemunculan). PURE. */
export function emptyParamPlaceholders(
  paramMap: readonly string[] | null,
  params: readonly string[],
): string[] {
  if (!paramMap) return []
  const empty = paramMap.filter((_, i) => !(params[i] ?? '').trim())
  return [...new Set(empty)]
}

export function missingDataReason(missing: readonly string[]): string {
  return (
    `Data untuk variabel ${missing.join(', ')} kosong pada pesanan/lead ini — ` +
    'Template Meta tidak bisa diisi, follow-up ini dilewati untuk pelanggan ini'
  )
}

export function decideFollowUpFailure(input: FollowUpFailureInput): FollowUpFailureDecision {
  switch (input.code) {
    case 'NO_SESSION':
      if (input.retryCount >= MAX_WA_RETRY) {
        return {
          action: 'FAIL_FINAL',
          reason: `Sesi WhatsApp tidak terhubung setelah ${MAX_WA_RETRY}x percobaan — hubungkan ulang nomor`,
          scope: 'SENDER',
        }
      }
      return {
        action: 'RETRY',
        reason: 'Sesi WhatsApp tidak terhubung — dicoba lagi otomatis',
        backoffMs: WA_RECONNECT_BACKOFF_MS,
      }
    case 'NO_TEMPLATE':
      // Data satu pesanan kosong (mis. {resi}) bukan template rusak — final
      // tanpa menyalahkan template (retry tak akan mengisi datanya).
      if (input.missingData && input.missingData.length > 0) {
        return { action: 'FAIL_FINAL', reason: missingDataReason(input.missingData), scope: 'CUSTOMER' }
      }
      return retryOrFail(input, pickReason(input, 'Template Meta belum disetujui / belum disiapkan'), {
        maxRetry: MAX_WA_RETRY,
        backoffMs: WA_RECONNECT_BACKOFF_MS,
        scope: 'TEMPLATE',
      })
    case 'INSUFFICIENT_CREDIT':
      return retryOrFail(
        input,
        pickReason(input, 'Kredit pesan habis — top up untuk mengirim template Meta'),
        { maxRetry: MAX_WA_RETRY, backoffMs: WA_RECONNECT_BACKOFF_MS, scope: 'CREDIT' },
      )
    case 'MARKETING_OPT_OUT':
      return { action: 'SKIP', reason: 'Customer opt-out pesan marketing' }
    case 'BLACKLISTED':
      // Blacklist kontak di inbox (compliance), beda dengan FollowUpBlacklist.
      // Disengaja oleh seller — bukan kegagalan, jangan notifikasi.
      return { action: 'SKIP', reason: 'Kontak di-blacklist — follow-up tidak dikirim' }
    case 'WINDOW_CLOSED':
      // Follow-up belum ditautkan / peta variabel belum lengkap: perbaikannya
      // di pengaturan follow-up, jadi lingkupnya TEMPLATE.
      return retryOrFail(input, pickReason(input, 'Window 24 jam customer sudah tutup'), {
        maxRetry: MAX_SEND_RETRY,
        backoffMs: RETRY_BACKOFF_MS,
        scope: 'TEMPLATE',
      })
    default:
      return retryOrFail(input, pickReason(input, 'Gagal kirim'), {
        maxRetry: MAX_SEND_RETRY,
        backoffMs: RETRY_BACKOFF_MS,
        scope: 'OTHER',
      })
  }
}

// Gagal yang perbaikannya di konfigurasi/kontak — tidak akan sembuh dengan
// klik ulang. Sisanya (sesi/transmisi) boleh dicoba lagi.
const UNPROCESSABLE_CODES: ReadonlySet<SmartSendCode> = new Set<SmartSendCode>([
  'NO_TEMPLATE',
  'WINDOW_CLOSED',
  'BLACKLISTED',
  'MARKETING_OPT_OUT',
  'INSUFFICIENT_CREDIT',
])

/**
 * Status HTTP untuk "Kirim sekarang" yang gagal. Selalu 4xx: Cloudflare
 * mengganti body 5xx dari origin dengan halaman HTML sehingga alasan ramah
 * tidak sampai ke seller (pola sama dengan route waba/exchange).
 */
export function manualSendFailureStatus(input: { code?: SmartSendCode; permanent?: boolean }): 400 | 422 {
  if (input.permanent) return 422
  return input.code && UNPROCESSABLE_CODES.has(input.code) ? 422 : 400
}

export function followUpTemplateLink(followUpTemplateId: string): string {
  return `/pesanan/templates?highlight=${encodeURIComponent(followUpTemplateId)}`
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export interface FollowUpFailureNotification {
  type: string
  title: string
  message: string
  link: string
}

interface ScopeCopy {
  title: string
  closing: string
  link: (followUpTemplateId: string) => string
}

// Judul berbeda per scope — dipakai juga sebagai kunci dedupe (bersama link)
// supaya gagal generik tidak menelan notifikasi template rusak yang nyata.
const SCOPE_COPY: Record<Exclude<FollowUpFailureScope, 'CUSTOMER'>, ScopeCopy> = {
  TEMPLATE: {
    title: 'Template follow-up perlu diperbaiki',
    closing: 'Follow-up berikutnya dengan template ini juga akan gagal sampai diperbaiki.',
    link: followUpTemplateLink,
  },
  SENDER: {
    title: 'Follow-up tertahan: nomor WhatsApp terputus',
    closing: 'Semua follow-up tertahan sampai nomor pengirim terhubung kembali.',
    link: () => '/whatsapp',
  },
  CREDIT: {
    title: 'Follow-up tertahan: Kredit Pesan habis',
    closing: 'Top up Kredit Pesan supaya follow-up via Template Meta terkirim lagi.',
    link: () => '/billing',
  },
  OTHER: {
    title: 'Follow-up gagal terkirim',
    closing: 'Cek detailnya di riwayat follow-up.',
    link: followUpTemplateLink,
  },
}

/** Isi notifikasi bell per scope; null = tidak perlu notifikasi (CUSTOMER). */
export function buildFollowUpFailureNotification(input: {
  followUpTemplateId: string
  templateName: string
  reason: string
  scope: FollowUpFailureScope
}): FollowUpFailureNotification | null {
  if (input.scope === 'CUSTOMER') return null
  const copy = SCOPE_COPY[input.scope]
  return {
    type: FOLLOWUP_FAILURE_NOTIF_TYPE,
    title: copy.title,
    message:
      `Follow-up "${truncate(input.templateName, 120)}" gagal dikirim ke pelanggan. ` +
      `Alasan: ${truncate(input.reason, MAX_REASON_CHARS)}. ${copy.closing}`,
    link: copy.link(input.followUpTemplateId),
  }
}
