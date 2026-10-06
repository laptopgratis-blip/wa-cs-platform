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

export interface FollowUpFailureInput {
  code?: SmartSendCode
  permanent?: boolean
  detail?: string
  error?: string
  retryCount: number
}

export type FollowUpFailureDecision =
  | { action: 'RETRY'; reason: string; backoffMs: number }
  | { action: 'FAIL_FINAL'; reason: string }
  | { action: 'SKIP'; reason: string }

function pickReason(input: FollowUpFailureInput, fallback: string): string {
  return input.detail || input.error || fallback
}

function retryOrFail(
  input: FollowUpFailureInput,
  reason: string,
  maxRetry: number,
  backoffMs: number,
): FollowUpFailureDecision {
  if (input.permanent || input.retryCount >= maxRetry) return { action: 'FAIL_FINAL', reason }
  return { action: 'RETRY', reason, backoffMs }
}

export function decideFollowUpFailure(input: FollowUpFailureInput): FollowUpFailureDecision {
  switch (input.code) {
    case 'NO_SESSION':
      if (input.retryCount >= MAX_WA_RETRY) {
        return {
          action: 'FAIL_FINAL',
          reason: `Sesi WhatsApp tidak terhubung setelah ${MAX_WA_RETRY}x percobaan — hubungkan ulang nomor`,
        }
      }
      return {
        action: 'RETRY',
        reason: 'Sesi WhatsApp tidak terhubung — dicoba lagi otomatis',
        backoffMs: WA_RECONNECT_BACKOFF_MS,
      }
    case 'NO_TEMPLATE':
      return retryOrFail(
        input,
        pickReason(input, 'Template Meta belum disetujui / belum disiapkan'),
        MAX_WA_RETRY,
        WA_RECONNECT_BACKOFF_MS,
      )
    case 'INSUFFICIENT_CREDIT':
      return retryOrFail(
        input,
        pickReason(input, 'Kredit pesan habis — top up untuk mengirim template Meta'),
        MAX_WA_RETRY,
        WA_RECONNECT_BACKOFF_MS,
      )
    case 'MARKETING_OPT_OUT':
      return { action: 'SKIP', reason: 'Customer opt-out pesan marketing' }
    default:
      return retryOrFail(input, pickReason(input, 'Gagal kirim'), MAX_SEND_RETRY, RETRY_BACKOFF_MS)
  }
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

export function buildFollowUpFailureNotification(input: {
  followUpTemplateId: string
  templateName: string
  reason: string
}): FollowUpFailureNotification {
  return {
    type: FOLLOWUP_FAILURE_NOTIF_TYPE,
    title: 'Follow-up gagal terkirim',
    message:
      `Follow-up "${truncate(input.templateName, 120)}" gagal dikirim ke pelanggan. ` +
      `Alasan: ${truncate(input.reason, MAX_REASON_CHARS)}. ` +
      'Follow-up berikutnya dengan template ini juga akan gagal sampai diperbaiki.',
    link: followUpTemplateLink(input.followUpTemplateId),
  }
}
