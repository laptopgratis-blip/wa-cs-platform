// In-memory rate limiter sederhana untuk endpoint live publik.
// Bukan robust untuk multi-instance prod (process-local), tapi cukup untuk
// MVP & hulao single-VPS deployment. Bisa swap ke Redis nanti.
//
// Empat lapis (2026-06-10):
// 1. Chat per IP per slug (30/menit) — konversasi normal lewat, spammer stop.
// 2. Chat per ROOM global (120/menit, terlepas IP) — defense-in-depth kalau
//    IP dipalsukan/terdistribusi; tiap pesan memicu Claude + TTS berbayar.
// 3. Lead per IP per slug (5/menit) — endpoint publik yang terima PII dan
//    memicu kirim WA, tidak ada alasan legit submit berkali-kali.
// 4. Poll per IP per slug (600/menit) — /stage & /feed di-poll ~1.5-3dtk per
//    device (≈40/menit legit). Limit SENGAJA longgar karena carrier seluler
//    Indonesia pakai CGNAT (banyak penonton legit berbagi 1 IP) — tujuannya
//    cuma mematikan hammering kasar dari 1 IP, bukan membatasi penonton.

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
const POLL_MAX_PER_WINDOW = 600

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

// Polling /stage & /feed: 600/menit per IP per slug (lihat lapis 4 di atas).
// Kind dipisah supaya satu endpoint yang kena limit tidak ikut memblokir
// endpoint lain (stage 429 → feed tetap jalan).
export function checkPollRateLimit(
  ip: string,
  slug: string,
  kind: 'stage' | 'feed',
): RateLimitResult {
  return hitBucket(`poll:${kind}::${ip}::${slug}`, POLL_MAX_PER_WINDOW)
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
