// In-memory rate limiter sederhana untuk live room chat.
// Bukan robust untuk multi-instance prod (process-local), tapi cukup untuk
// MVP & hulao single-VPS deployment. Bisa swap ke Redis nanti.
//
// Limit: 30 msg/menit per IP per slug — cukup untuk konversasi normal,
// stop spammer yang mau drain saldo owner.

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 30

export function checkRateLimit(ip: string, slug: string): {
  ok: boolean
  retryAfterSec?: number
} {
  const key = `${ip}::${slug}`
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now })
    return { ok: true }
  }
  if (b.count >= MAX_PER_WINDOW) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((b.windowStart + WINDOW_MS - now) / 1000),
    }
  }
  b.count++
  return { ok: true }
}

// Cleanup expired buckets — dipanggil setiap N msg untuk hindari leak.
let lastCleanup = Date.now()
const CLEANUP_INTERVAL_MS = 10 * 60_000
export function maybeCleanup(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, b] of buckets) {
    if (now - b.windowStart >= WINDOW_MS) buckets.delete(key)
  }
}
