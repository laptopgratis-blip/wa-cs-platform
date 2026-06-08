// Token tanda-tangan HMAC untuk link publik testimoni & konfirmasi-diterima.
// Link dikirim via follow-up WA ({link_review} / {link_terima}). Tanpa expiry —
// customer bisa balas testimoni kapan pun. Token mengikat orderId + purpose
// supaya tidak bisa ditebak/di-enumerate, tapi tetap stateless (tak perlu row
// di DB sampai customer submit).
import { createHmac, timingSafeEqual } from 'node:crypto'

export type ReviewPurpose = 'review' | 'terima'

function secret(): string {
  // Reuse CRON_SECRET (sudah ada di prod). Fallback ENCRYPTION_KEY / NEXTAUTH.
  return (
    process.env.REVIEW_TOKEN_SECRET ??
    process.env.CRON_SECRET ??
    process.env.ENCRYPTION_KEY ??
    process.env.NEXTAUTH_SECRET ??
    'hulao-default-review-secret-rotate-me'
  )
}

export function createReviewToken(
  orderId: string,
  purpose: ReviewPurpose,
): string {
  return createHmac('sha256', secret())
    .update(`${orderId}|${purpose}`)
    .digest('hex')
}

export function verifyReviewToken(
  orderId: string,
  purpose: ReviewPurpose,
  token: string | null | undefined,
): boolean {
  if (!token) return false
  const expected = createReviewToken(orderId, purpose)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(token, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Base URL untuk link publik. Prod hulao.id; bisa override via env.
export function publicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    'https://hulao.id'
  ).replace(/\/$/, '')
}

export function reviewLink(orderId: string): string {
  const t = createReviewToken(orderId, 'review')
  return `${publicBaseUrl()}/review/${encodeURIComponent(orderId)}?t=${t}`
}

export function confirmReceivedLink(orderId: string): string {
  const t = createReviewToken(orderId, 'terima')
  return `${publicBaseUrl()}/diterima/${encodeURIComponent(orderId)}?t=${t}`
}
