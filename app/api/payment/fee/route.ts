// GET /api/payment/fee?code=BRIVA&amount=100000
// Hitung biaya transaksi per channel. Fee ditampilkan transparan ke customer.
import { NextResponse } from 'next/server'

import { getFeeCalculation } from '@/lib/tripay'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const amount = Number(url.searchParams.get('amount'))

  if (!code || !amount || Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json(
      { success: false, error: 'Parameter code dan amount wajib diisi' },
      { status: 400 },
    )
  }

  try {
    const fees = await getFeeCalculation(code, amount)
    return NextResponse.json({ success: true, data: fees })
  } catch (err) {
    console.error('[GET /api/payment/fee] gagal:', err)
    const message = err instanceof Error ? err.message : 'Gagal menghitung biaya'
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    )
  }
}
