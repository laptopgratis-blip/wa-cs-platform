// Resolusi IP klien yang aman di belakang SATU trusted proxy (Traefik).
//
// Asumsi deployment: semua request publik lewat Traefik, dan Traefik
// meng-APPEND IP koneksi asli sebagai elemen TERAKHIR X-Forwarded-For.
// Elemen-elemen di depannya datang dari header yang dikirim client sendiri
// — bisa dipalsukan bebas. JANGAN pernah pakai elemen PERTAMA untuk rate
// limit / fingerprint: spammer tinggal rotasi nilai XFF tiap request dan
// limiter per-IP jadi tembus.
//
// Kalau header tidak ada sama sekali (akses tanpa proxy, mis. dev lokal),
// return 'unknown' — lebih aman semua dilempar ke satu bucket ketat
// daripada percaya header lain yang juga bisa dipalsukan.
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (!xff) return 'unknown'
  const parts = xff
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return parts[parts.length - 1] ?? 'unknown'
}
