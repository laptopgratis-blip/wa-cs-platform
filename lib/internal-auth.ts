// Auth untuk endpoint /api/internal/* yang dipanggil oleh wa-service.
// Sederhana: cek `x-service-secret` header == WA_SERVICE_SECRET di env.
import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

const SECRET = process.env.WA_SERVICE_SECRET || ''

// Perbandingan secret timing-safe — hindari timing attack pada string compare.
// Panjang beda → langsung false (timingSafeEqual butuh buffer sama panjang).
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function requireServiceSecret(req: Request): NextResponse | null {
  // Fail-closed di SEMUA environment: tanpa WA_SERVICE_SECRET, endpoint
  // /api/internal/* menolak request. Set var ini di .env sebelum dipakai
  // (lihat env.local.template).
  if (!SECRET) {
    console.error(
      '[internal-auth] WA_SERVICE_SECRET belum dikonfigurasi — request /api/internal/* ditolak (fail-closed)',
    )
    return NextResponse.json(
      { success: false, error: 'WA_SERVICE_SECRET belum dikonfigurasi' },
      { status: 503 },
    )
  }
  const got = req.headers.get('x-service-secret') ?? ''
  if (!safeEqual(got, SECRET)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }
  return null
}
