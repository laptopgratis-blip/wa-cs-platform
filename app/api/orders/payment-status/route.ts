// GET /api/orders/payment-status?invoice=INV-... (PUBLIC, no-auth)
// Polling status pembayaran untuk halaman invoice — data non-sensitif saja.
// Model akses sama dgn halaman invoice publik: cukup tahu invoiceNumber unik.
import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const invoice = searchParams.get('invoice')?.trim()
  if (!invoice) return jsonError('invoice wajib diisi', 400)

  try {
    const order = await prisma.userOrder.findUnique({
      where: { invoiceNumber: invoice },
      select: {
        paymentStatus: true,
        paidAt: true,
        orderPayments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            payCode: true,
            checkoutUrl: true,
            channelCode: true,
            channelName: true,
            feeCustomer: true,
            amount: true,
            expiredAt: true,
          },
        },
      },
    })
    if (!order) return jsonError('Order tidak ditemukan', 404)

    const op = order.orderPayments[0] ?? null
    return jsonOk({
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt?.toISOString() ?? null,
      orderPayment: op
        ? {
            status: op.status,
            payCode: op.payCode,
            checkoutUrl: op.checkoutUrl,
            channelCode: op.channelCode,
            channelName: op.channelName,
            feeCustomer: op.feeCustomer,
            amount: op.amount,
            expiredAt: op.expiredAt?.toISOString() ?? null,
          }
        : null,
    })
  } catch (err) {
    console.error('[GET /api/orders/payment-status] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
