// POST /api/internal/order-auto-paid — dipanggil bank-scraper service saat
// order ter-auto-confirm. Tugasnya:
//   1. Fire server-side pixel Purchase (kalau order punya orderFormId)
//   2. Send WA notification ke customer (best-effort, lewat wa-service)
//
// Auth: x-scraper-secret header == SCRAPER_SECRET env.
// Catatan: scraper sudah update paymentStatus = PAID + autoConfirmedAt sebelum
// memanggil endpoint ini, jadi di sini tugas downstream saja.
import { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { firePixelEventForOrder } from '@/lib/services/pixel-fire'

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || ''

function authOk(req: Request): boolean {
  if (!SCRAPER_SECRET) {
    console.warn(
      '[order-auto-paid] SCRAPER_SECRET kosong — endpoint terbuka tanpa auth!',
    )
    return true
  }
  return req.headers.get('x-scraper-secret') === SCRAPER_SECRET
}

export async function POST(req: Request) {
  if (!authOk(req)) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const body = await req.json().catch(() => null)
  const orderId = typeof body?.orderId === 'string' ? body.orderId : null
  if (!orderId) return jsonError('orderId wajib')

  try {
    const order = await prisma.userOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        invoiceNumber: true,
        orderFormId: true,
        customerPhone: true,
        customerName: true,
        totalRp: true,
        paymentStatus: true,
        autoConfirmedBy: true,
      },
    })
    if (!order) return jsonError('Order tidak ditemukan', 404)
    if (order.paymentStatus !== 'PAID') {
      return jsonError('Order belum PAID', 400)
    }

    // Fire pixel Purchase — best-effort, async, tidak block response.
    if (order.invoiceNumber && order.orderFormId) {
      firePixelEventForOrder({
        orderId: order.id,
        eventName: 'Purchase',
      }).catch((e) => {
        console.error(`[order-auto-paid] pixel fire gagal ${order.id}:`, e)
      })
    }

    // WA notification — kirim via wa-service (best-effort).
    sendAutoPaidNotification(order).catch((e) => {
      console.error(`[order-auto-paid] WA notif gagal ${order.id}:`, e)
    })

    return jsonOk({ ok: true, orderId: order.id })
  } catch (err) {
    console.error('[POST /api/internal/order-auto-paid]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

// Kirim notifikasi WA ke customer pakai wa-service. Hanya kalau user
// punya WA session aktif & shipping profile sudah di-setup.
async function sendAutoPaidNotification(order: {
  id: string
  userId: string
  invoiceNumber: string | null
  customerPhone: string
  customerName: string
  totalRp: number
}) {
  const waUrl = process.env.WA_SERVICE_URL || 'http://wa-service:3001'
  const secret = process.env.WA_SERVICE_SECRET || ''

  // Cari WA session aktif user (untuk kirim atas nama user).
  const session = await prisma.whatsappSession.findFirst({
    where: { userId: order.userId, status: 'CONNECTED' },
    select: { id: true },
  })
  if (!session) return // user belum connect WA, skip diam-diam

  const message = [
    `Halo ${order.customerName}, pembayaran transfer Anda untuk order *${order.invoiceNumber ?? order.id}*`,
    `senilai *Rp ${order.totalRp.toLocaleString('id-ID')}* sudah kami terima dan dikonfirmasi otomatis.`,
    '',
    'Pesanan Anda akan segera diproses. Terima kasih!',
  ].join('\n')

  // Wa-service expect endpoint /send (sesuai pattern existing). Format
  // nomor: 62xxx tanpa +. Helper ada di submit endpoint, tapi inline
  // saja di sini supaya simple.
  const phone = normalizePhone(order.customerPhone)
  if (!phone) return

  await fetch(`${waUrl}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-secret': secret,
    },
    body: JSON.stringify({
      sessionId: session.id,
      to: phone,
      message,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    // best-effort
  })
}

function normalizePhone(p: string): string | null {
  const digits = p.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  if (digits.startsWith('8')) return '62' + digits
  return digits
}
