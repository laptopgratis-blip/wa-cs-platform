// In-memory rate limiter sederhana untuk endpoint live publik.
// Bukan robust untuk multi-instance prod (process-local), tapi cukup untuk
// MVP & hulao single-VPS deployment. Bisa swap ke Redis nanti.
//
// Tiga lapis (2026-06-10):
// 1. Chat per IP per slug (30/menit) — konversasi normal lewat, spammer stop.
// 2. Chat per ROOM global (120/menit, terlepas IP) — defense-in-depth kalau
//    IP dipalsukan/terdistribusi; tiap pesan memicu Claude + TTS berbayar.
// 3. Lead per IP per slug (5/menit) — endpoint publik yang terima PII dan
//    memicu kirim WA, tidak ada alasan legit submit berkali-kali.

interface Bucket {
  count: number
  windowStart: number
}

interface RateLimitResult {
  ok: boolean
  retryAfterSec?: number
}

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000

const CHAT_MAX_PER_WINDOW = 30
const ROOM_MAX_PER_WINDOW = 120
const LEAD_MAX_PER_WINDOW = 5

// Helper generik fixed-window. Update bucket selalu set object BARU
// (immutable) — jangan mutasi bucket lama in-place.
function hitBucket(key: string, max: number): RateLimitResult {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now })
    return { ok: true }
  }
  if (b.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((b.windowStart + WINDOW_MS - now) / 1000),
    }
  }
  buckets.set(key, { count: b.count + 1, windowStart: b.windowStart })
  return { ok: true }
}

// Chat: 30 msg/menit per IP per slug.
export function checkRateLimit(ip: string, slug: string): RateLimitResult {
  return hitBucket(`chat::${ip}::${slug}`, CHAT_MAX_PER_WINDOW)
}

// Chat: cap global per room, terlepas IP. Backstop kalau limiter per-IP
// dilewati (XFF palsu / botnet) — lindungi saldo owner dari drain massal.
export function checkRoomRateLimit(slug: string): RateLimitResult {
  return hitBucket(`room::${slug}`, ROOM_MAX_PER_WINDOW)
}

// Lead capture: 5 submit/menit per IP per slug.
export function checkLeadRateLimit(ip: string, slug: string): RateLimitResult {
  return hitBucket(`lead::${ip}::${slug}`, LEAD_MAX_PER_WINDOW)
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
