// Auth terpusat untuk semua endpoint /api/cron/*.
//
// Fail-closed: CRON_SECRET kosong → 503 di SEMUA environment (bukan lolos).
// Credential yang diterima (timing-safe compare semuanya):
//   - Header `Authorization: Bearer <secret>` (preferensi baru)
//   - Header `x-cron-secret: <secret>` (legacy, dipakai cron internal)
//   - Query `?secret=<secret>` (legacy, kompat cron-job.org existing)
//
// Pemakaian di route:
//   const authErr = requireCronAuth(req)
//   if (authErr) return authErr
import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

// Perbandingan secret timing-safe — hindari timing attack pada string compare.
// Panjang beda → langsung false (timingSafeEqual butuh buffer sama panjang).
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Ambil token dari header Authorization bentuk "Bearer <secret>".
function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  if (!/^bearer\s/i.test(header)) return ''
  return header.slice('bearer '.length).trim()
}

export function requireCronAuth(req: Request): NextResponse | null {
  // Baca env saat dipanggil (bukan module load) supaya urutan loading env
  // tidak jadi masalah & gampang di-test.
  const expected = process.env.CRON_SECRET ?? ''
  if (!expected) {
    console.error(
      '[cron-auth] CRON_SECRET belum dikonfigurasi — endpoint cron ditolak (fail-closed)',
    )
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET belum dikonfigurasi' },
      { status: 503 },
    )
  }

  const url = new URL(req.url)
  const candidates = [
    bearerToken(req),
    req.headers.get('x-cron-secret') ?? '',
    url.searchParams.get('secret') ?? '',
  ]
  const authorized = candidates.some(
    (token) => token.length > 0 && safeEqual(token, expected),
  )
  if (!authorized) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }
  return null
}
