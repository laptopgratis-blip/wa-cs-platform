// In-memory rate limiter untuk endpoint shipping PUBLIK (no-auth) di public
// order form. Pola sama dengan lib/services/live/rate-limit.ts: fixed window
// per IP, process-local (cukup untuk single-VPS hulao; swap Redis nanti kalau
// multi-instance).
//
// Konteks (incident 2026-07-10): kuota Komerce 500 hit/hari jebol — 567
// search + 95 cost ditolak 429. Endpoint publik tanpa limit = siapa pun bisa
// membakar kuota. Limit longgar untuk manusia (autocomplete legit ±1 hit per
// jeda ketik), mematikan hammering kasar per IP.

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

// 30 search/menit per IP ≈ satu orang mengetik-hapus berkali-kali pun cukup.
const SEARCH_MAX_PER_WINDOW = 30
// 20 hitung ongkir/menit per IP — normalnya 1-3 kali per checkout.
const COST_MAX_PER_WINDOW = 20

// Fixed-window generik. Set object BARU tiap update (immutable), jangan
// mutasi bucket lama in-place.
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

// Autocomplete destinasi: 30 req/menit per IP (global, bukan per slug —
// bot bisa rotasi slug).
export function checkDestinationSearchLimit(ip: string): RateLimitResult {
  maybeCleanup()
  return hitBucket(`dest::${ip}`, SEARCH_MAX_PER_WINDOW)
}

// Hitung ongkir: 20 req/menit per IP.
export function checkCostPreviewLimit(ip: string): RateLimitResult {
  maybeCleanup()
  return hitBucket(`cost::${ip}`, COST_MAX_PER_WINDOW)
}

// Bersihkan bucket kedaluwarsa supaya Map tidak bocor memori.
let lastCleanup = Date.now()
const CLEANUP_INTERVAL_MS = 5 * 60_000

function maybeCleanup(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, b] of buckets) {
    if (now - b.windowStart >= WINDOW_MS) buckets.delete(key)
  }
}
