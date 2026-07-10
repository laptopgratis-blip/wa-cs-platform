// Rate limiter in-memory sederhana (fixed window per key).
// Cocok untuk deployment single-instance (VPS docker-compose). State hilang
// saat proses restart — acceptable untuk guard brute-force ringan (mis.
// percobaan password). Kalau nanti multi-instance, pindah ke DB/Redis
// (lihat pola DB-backed di lib/otp/auth-otp.ts).

interface WindowEntry {
  count: number
  windowStart: number
}

const buckets = new Map<string, WindowEntry>()

// Cegah Map tumbuh tak terbatas — buang entry yang window-nya sudah lewat.
function pruneExpired(windowMs: number): void {
  if (buckets.size < 1000) return
  const now = Date.now()
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart >= windowMs) buckets.delete(key)
  }
}

export function checkRateLimit(input: {
  key: string
  limit: number
  windowMs: number
}): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const entry = buckets.get(input.key)
  if (!entry || now - entry.windowStart >= input.windowMs) {
    return { allowed: true, retryAfterMs: 0 }
  }
  if (entry.count < input.limit) {
    return { allowed: true, retryAfterMs: 0 }
  }
  return {
    allowed: false,
    retryAfterMs: input.windowMs - (now - entry.windowStart),
  }
}

export function recordRateLimitHit(input: {
  key: string
  windowMs: number
}): void {
  pruneExpired(input.windowMs)
  const now = Date.now()
  const entry = buckets.get(input.key)
  if (!entry || now - entry.windowStart >= input.windowMs) {
    buckets.set(input.key, { count: 1, windowStart: now })
    return
  }
  buckets.set(input.key, { ...entry, count: entry.count + 1 })
}
