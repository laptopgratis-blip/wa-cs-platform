// Auth untuk endpoint /api/internal/* yang dipanggil oleh wa-service.
// Sederhana: cek `x-service-secret` header == WA_SERVICE_SECRET di env.
import { NextResponse } from 'next/server'

const SECRET = process.env.WA_SERVICE_SECRET || ''

export function requireServiceSecret(req: Request): NextResponse | null {
  // Kalau SECRET tidak diset, jalankan di mode dev — tetap loloskan request
  // tapi log warning. Production HARUS diset.
  if (!SECRET) {
    console.warn(
      '[internal-auth] WA_SERVICE_SECRET kosong — endpoint /api/internal/* tidak terproteksi',
    )
    return null
  }
  const got = req.headers.get('x-service-secret')
  if (got !== SECRET) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }
  return null
}
