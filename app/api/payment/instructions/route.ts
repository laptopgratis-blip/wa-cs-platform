// GET /api/payment/instructions?code=BRIVA
// Ambil instruksi pembayaran untuk channel tertentu. Dipakai di
// halaman checkout untuk menampilkan langkah-langkah bayar.
import { NextResponse } from 'next/server'

import { getPaymentInstruction } from '@/lib/tripay'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')

  if (!code) {
    return NextResponse.json(
      { success: false, error: 'Parameter code wajib diisi' },
      { status: 400 },
    )
  }

  try {
    const instructions = await getPaymentInstruction(code)
    return NextResponse.json({ success: true, data: instructions })
  } catch (err) {
    console.error('[GET /api/payment/instructions] gagal:', err)
    const message = err instanceof Error ? err.message : 'Gagal mengambil instruksi'
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    )
  }
}
