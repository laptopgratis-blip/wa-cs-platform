// Notif WA untuk Order System (Phase 4, 2026-05-07).
// Hook di submit order baru & upload bukti transfer. Best-effort — kegagalan
// notifikasi TIDAK boleh gagalkan order. Pakai sistem WA Hulao yang aktif:
//   - Cari WhatsappSession user dengan status CONNECTED + isActive
//   - Kirim ke shippingProfile.waConfirmNumber via waService.sendMessage
//   - Kalau tidak ada WA session aktif / waConfirm not setup → silent skip
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

interface OrderNotifData {
  invoiceNumber: string
  customerName: string
  customerPhone: string
  totalRp: number
  paymentMethod: string
  shippingCityName: string | null
  itemsSummary: string
}

function formatRp(n: number): string {
  return n.toLocaleString('id-ID')
}

async function getActiveSession(userId: string) {
  return prisma.whatsappSession.findFirst({
    where: { userId, status: 'CONNECTED', isActive: true },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  })
}

async function getNotifTarget(userId: string) {
  const profile = await prisma.userShippingProfile.findUnique({
    where: { userId },
    select: { waConfirmNumber: true, waConfirmActive: true },
  })
  if (!profile?.waConfirmActive || !profile.waConfirmNumber) return null
  // Format harus 62xxx (validated saat user setup di /bank-accounts).
  if (!/^62\d{8,15}$/.test(profile.waConfirmNumber)) return null
  return profile.waConfirmNumber
}

// Notif saat order baru masuk (dari /api/orders/submit).
export async function notifyNewOrder(orderId: string): Promise<void> {
  try {
    const order = await prisma.userOrder.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        invoiceNumber: true,
        customerName: true,
        customerPhone: true,
        totalRp: true,
        paymentMethod: true,
        shippingCityName: true,
        items: true,
      },
    })
    if (!order || !order.invoiceNumber) return

    const target = await getNotifTarget(order.userId)
    if (!target) return
    const session = await getActiveSession(order.userId)
    if (!session) return

    const items = (order.items as Array<{ name: string; qty: number }>) ?? []
    const itemsSummary =
      items
        .slice(0, 3)
        .map((i) => `• ${i.name} × ${i.qty}`)
        .join('\n') + (items.length > 3 ? `\n...+${items.length - 3} lain` : '')

    const data: OrderNotifData = {
      invoiceNumber: order.invoiceNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalRp: order.totalRp,
      paymentMethod: order.paymentMethod,
      shippingCityName: order.shippingCityName,
      itemsSummary,
    }

    const message = [
      '🆕 *Order Baru!*',
      '',
      `Invoice: *${data.invoiceNumber}*`,
      `Customer: ${data.customerName}`,
      `📞 ${data.customerPhone}`,
      data.shippingCityName ? `📍 ${data.shippingCityName}` : '',
      '',
      data.itemsSummary,
      '',
      `💰 Total: *Rp ${formatRp(data.totalRp)}*`,
      `💳 Bayar: ${data.paymentMethod}`,
      '',
      `Detail: https://hulao.id/pesanan`,
    ]
      .filter(Boolean)
      .join('\n')

    await waService.sendMessage(session.id, target, message)
  } catch (err) {
    console.error('[notifyNewOrder] gagal kirim WA:', err)
  }
}

// Notif saat customer upload bukti transfer (dari /api/orders/[id]/upload-proof).
export async function notifyProofUploaded(orderId: string): Promise<void> {
  try {
    const order = await prisma.userOrder.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        invoiceNumber: true,
        customerName: true,
        totalRp: true,
        paymentProofUrl: true,
      },
    })
    if (!order || !order.invoiceNumber) return

    const target = await getNotifTarget(order.userId)
    if (!target) return
    const session = await getActiveSession(order.userId)
    if (!session) return

    const message = [
      '💳 *Bukti Transfer Diterima*',
      '',
      `Invoice: *${order.invoiceNumber}*`,
      `Customer: ${order.customerName}`,
      `Total: Rp ${formatRp(order.totalRp)}`,
      '',
      order.paymentProofUrl
        ? `Bukti: https://hulao.id${order.paymentProofUrl}`
        : '',
      'Cek & konfirmasi di: https://hulao.id/pesanan',
    ]
      .filter(Boolean)
      .join('\n')

    await waService.sendMessage(session.id, target, message)
  } catch (err) {
    console.error('[notifyProofUploaded] gagal kirim WA:', err)
  }
}
