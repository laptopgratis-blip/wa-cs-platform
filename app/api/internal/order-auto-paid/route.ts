// POST /api/internal/order-auto-paid — dipanggil bank-scraper service saat
// order ter-auto-confirm. Tugasnya:
//   1. Fire server-side pixel Purchase (kalau order punya orderFormId)
//   2. Send WA notification ke customer (best-effort, lewat wa-service)
//
// Auth: x-scraper-secret header == SCRAPER_SECRET env.
// Catatan: scraper sudah update paymentStatus = PAID + autoConfirmedAt sebelum
// memanggil endpoint ini, jadi di sini tugas downstream saja.
import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { smartSend } from '@/lib/services/wa-send/smart-send'
import { listSenderCandidates } from '@/lib/wa-session'
import { generateQueueForOrder } from '@/lib/services/followup-engine'
import { triggerEntitlementsForOrderSafe } from '@/lib/services/entitlement-hook'
import { firePixelEventForOrder } from '@/lib/services/pixel-fire'

const SCRAPER_SECRET = process.env.SCRAPER_SECRET || ''

// Perbandingan secret timing-safe — hindari timing attack pada string compare.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Fail-closed: SCRAPER_SECRET kosong → 503 (bukan lolos). Return NextResponse
// error kalau auth gagal, null kalau lolos.
function requireScraperSecret(req: Request): NextResponse | null {
  if (!SCRAPER_SECRET) {
    console.error(
      '[order-auto-paid] SCRAPER_SECRET belum dikonfigurasi — request ditolak (fail-closed)',
    )
    return jsonError('SCRAPER_SECRET belum dikonfigurasi', 503)
  }
  const got = req.headers.get('x-scraper-secret') ?? ''
  if (!safeEqual(got, SCRAPER_SECRET)) {
    return jsonError('unauthorized', 401)
  }
  return null
}

export async function POST(req: Request) {
  const authErr = requireScraperSecret(req)
  if (authErr) return authErr

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

    // Generate follow-up queue PAYMENT_PAID — engine handle plan + WA gating.
    generateQueueForOrder(order.id, 'PAYMENT_PAID').catch((e) => {
      console.error(`[order-auto-paid] followup gagal ${order.id}:`, e)
    })

    // Entitlement digital (LMS course + e-book) — dispatcher grant semua
    // aset digital di order. Best-effort, tidak block.
    triggerEntitlementsForOrderSafe(order.id)

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
  // Bug lama (2026-08): endpoint POST `${WA_SERVICE_URL}/send` TIDAK ADA di
  // wa-service (yang benar /sessions/:id/send-message) → notif tak pernah
  // terkirim, error ditelan .catch(). Kini lewat smartSend (provider-aware:
  // Baileys / Cloud dalam window teks; Cloud di luar window → INFO_GENERIC).
  const phone = normalizePhone(order.customerPhone)
  if (!phone) return

  const candidates = await listSenderCandidates({
    userId: order.userId,
    preferContactPhone: phone,
  })
  if (candidates.length === 0) return // user belum connect WA, skip diam-diam

  const storeName = await prisma.user
    .findUnique({ where: { id: order.userId }, select: { name: true } })
    .then((u) => u?.name ?? 'Toko Kami')
    .catch(() => 'Toko Kami')

  const message = [
    `Halo ${order.customerName}, pembayaran transfer Anda untuk order *${order.invoiceNumber ?? order.id}*`,
    `senilai *Rp ${order.totalRp.toLocaleString('id-ID')}* sudah kami terima dan dikonfirmasi otomatis.`,
    '',
    'Pesanan Anda akan segera diproses. Terima kasih!',
  ].join('\n')

  const summary = `pembayaran order ${order.invoiceNumber ?? order.id} senilai Rp ${order.totalRp.toLocaleString('id-ID')} sudah kami terima dan dikonfirmasi`

  await smartSend({
    candidates,
    to: phone,
    text: message,
    template: {
      purposeKey: 'INFO_GENERIC',
      params: { body: [order.customerName, storeName, summary] },
    },
    purpose: 'NOTIF',
    source: 'SYSTEM',
  }).catch(() => undefined) // best-effort
}

function normalizePhone(p: string): string | null {
  const digits = p.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  if (digits.startsWith('8')) return '62' + digits
  return digits
}
