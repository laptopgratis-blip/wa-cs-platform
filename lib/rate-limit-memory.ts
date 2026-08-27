// Rate limiter in-memory sederhana (fixed window per key).
// Cocok untuk deployment single-instance (VPS docker-compose). State hilang
// saat proses restart — acceptable untuk guard brute-force ringan (mis.
// percobaan password). Kalau nanti multi-instance, pindah ke DB/Redis
// (lihat pola DB-backed di lib/otp/auth-otp.ts).
//
// SATU Map dipakai bersama oleh pemanggil dengan window yang BERBEDA-BEDA
// (60 detik untuk API publik, 15 menit untuk guard password, 1 jam untuk
// pembuatan kunci API). Karena itu window disimpan PER ENTRI: kalau pruning
// memakai window milik pemanggil yang kebetulan sedang jalan, trafik API
// (60 detik) akan menghapus counter password yang baru berjalan 2 dari 15
// menit — guard-nya diam-diam melemah jadi 5 percobaan per menit.

interface WindowEntry {
  count: number
  windowStart: number
  /** Window milik entri ini — dipakai saat pruning, bukan window pemanggil. */
  windowMs: number
}

const buckets = new Map<string, WindowEntry>()

// Cegah Map tumbuh tak terbatas — buang entry yang window-nya sudah lewat,
// dinilai dengan window masing-masing entri.
function pruneExpired(): void {
  if (buckets.size < 1000) return
  const now = Date.now()
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart >= entry.windowMs) buckets.delete(key)
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
  pruneExpired()
  const now = Date.now()
  const entry = buckets.get(input.key)
  if (!entry || now - entry.windowStart >= input.windowMs) {
    buckets.set(input.key, { count: 1, windowStart: now, windowMs: input.windowMs })
    return
  }
  buckets.set(input.key, { ...entry, count: entry.count + 1 })
}

/**
 * Check + record dalam satu langkah, sekaligus melaporkan sisa kuota untuk
 * header X-RateLimit-*. Dipakai API publik yang menghitung SETIAP request —
 * beda dari pasangan checkRateLimit/recordRateLimitHit di atas yang sengaja
 * hanya menghitung percobaan GAGAL (guard password).
 *
 * Saat kuota habis, counter TIDAK dinaikkan lagi: memperpanjang window untuk
 * penyerang yang terus menembak justru membuat klien jujur ikut terkunci.
 */
export function consumeRateLimit(input: {
  key: string
  limit: number
  windowMs: number
}): {
  allowed: boolean
  limit: number
  remaining: number
  resetAtMs: number
  retryAfterMs: number
} {
  pruneExpired()
  const now = Date.now()
  const entry = buckets.get(input.key)
  const fresh = !entry || now - entry.windowStart >= input.windowMs

  if (fresh) {
    buckets.set(input.key, { count: 1, windowStart: now, windowMs: input.windowMs })
    return {
      allowed: true,
      limit: input.limit,
      remaining: Math.max(0, input.limit - 1),
      resetAtMs: now + input.windowMs,
      retryAfterMs: 0,
    }
  }

  const resetAtMs = entry.windowStart + input.windowMs
  if (entry.count >= input.limit) {
    return {
      allowed: false,
      limit: input.limit,
      remaining: 0,
      resetAtMs,
      retryAfterMs: resetAtMs - now,
    }
  }

  const count = entry.count + 1
  buckets.set(input.key, { ...entry, count })
  return {
    allowed: true,
    limit: input.limit,
    remaining: Math.max(0, input.limit - count),
    resetAtMs,
    retryAfterMs: 0,
  }
}
