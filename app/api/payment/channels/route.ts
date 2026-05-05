// GET /api/payment/channels
// Ambil daftar channel pembayaran aktif dari Tripay. Dipakai oleh
// TripayChannelSelector component di halaman checkout select.
import { NextResponse } from 'next/server'

import { getPaymentChannels } from '@/lib/tripay'

// Cache channels untuk 5 menit supaya tidak spam API Tripay.
let cachedChannels: Awaited<ReturnType<typeof getPaymentChannels>> | null = null
let cachedAt = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 menit

export async function GET() {
  try {
    const now = Date.now()
    if (cachedChannels && now - cachedAt < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cachedChannels })
    }

    const channels = await getPaymentChannels()
    cachedChannels = channels
    cachedAt = now

    return NextResponse.json({ success: true, data: channels })
  } catch (err) {
    console.error('[GET /api/payment/channels] gagal:', err)
    const message = err instanceof Error ? err.message : 'Gagal mengambil channel pembayaran'
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    )
  }
}
