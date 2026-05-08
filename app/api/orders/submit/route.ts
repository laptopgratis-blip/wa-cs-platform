// POST /api/orders/submit (PUBLIC, no-auth)
// Customer submit order via OrderForm. Server bertanggung jawab penuh untuk:
//   1. Validasi input
//   2. Verifikasi form aktif & owner masih punya akses POWER
//   3. Hitung total via pricing engine (sumber kebenaran — JANGAN trust client)
//   4. Generate invoiceNumber + uniqueCode
//   5. Snapshot bank accounts aktif + zone yg di-apply
//   6. Save UserOrder + increment OrderForm.submissions + increment flash sale sold
//
// Catatan: contactId required di UserOrder (FK), tapi customer publik biasanya
// bukan contact existing. Strategi: cari/buat Contact otomatis dari nomor HP
// di scope user-pemilik-form, dengan source PUBLIC_FORM.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { generateQueueForOrder } from '@/lib/services/followup-engine'
import { notifyNewOrder } from '@/lib/services/order-notif'
import { calculateOrderTotal } from '@/lib/services/order-pricing'
import { firePixelEventForOrder } from '@/lib/services/pixel-fire'
import { prisma } from '@/lib/prisma'
import { submitOrderSchema } from '@/lib/validations/submit-order'

function generateInvoiceNumber(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `INV-${yyyy}${mm}${dd}-${random}`
}

function uniqueCode(): number {
  return Math.floor(100 + Math.random() * 900)  // 100-999
}

// Normalisasi nomor HP ke format Indonesia: 6281234567890
function normalizePhone(input: string): string {
  let p = input.replace(/[^\d]/g, '')
  if (p.startsWith('0')) p = '62' + p.slice(1)
  else if (p.startsWith('8')) p = '62' + p
  return p
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = submitOrderSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  const data = parsed.data

  try {
    // 1. Cari OrderForm by slug + cek aktif.
    const form = await prisma.orderForm.findUnique({
      where: { slug: data.slug },
      include: { user: { select: { id: true } } },
    })
    if (!form || !form.isActive) {
      return jsonError('Form tidak aktif atau tidak ditemukan', 404)
    }

    // 2. Cek owner masih punya akses POWER.
    const access = await checkOrderSystemAccess(form.userId)
    if (!access.hasAccess) {
      return jsonError(
        'Form ini sedang tidak menerima order. Coba hubungi penjual langsung.',
        403,
      )
    }

    // 3. Validasi payment method match form config.
    if (data.paymentMethod === 'COD' && !form.acceptCod) {
      return jsonError('Form ini tidak menerima pembayaran COD', 400)
    }
    if (data.paymentMethod === 'TRANSFER' && !form.acceptTransfer) {
      return jsonError('Form ini tidak menerima pembayaran Transfer', 400)
    }

    // 4. Hitung total (sumber kebenaran — JANGAN trust client).
    const pricing = await calculateOrderTotal({
      userId: form.userId,
      items: data.items,
      shippingDestinationId: data.shippingDestinationId,
      shippingProvinceName: data.shippingProvinceName,
      shippingCityName: data.shippingCityName,
      selectedCourier: data.shippingCourier ?? undefined,
      selectedService: data.shippingService ?? undefined,
      paymentMethod: data.paymentMethod,
      flatCodCost:
        data.paymentMethod === 'COD' ? form.shippingFlatCod : undefined,
    })

    if (pricing.items.length === 0) {
      return jsonError('Produk tidak valid / tidak aktif', 400)
    }
    if (pricing.subtotal === 0) {
      return jsonError('Subtotal nol — periksa qty produk', 400)
    }

    // 5. Bank accounts snapshot (untuk TRANSFER).
    let bankSnapshot: Array<{
      bankName: string
      accountNumber: string
      accountName: string
      isDefault: boolean
    }> = []
    if (data.paymentMethod === 'TRANSFER') {
      const banks = await prisma.userBankAccount.findMany({
        where: { userId: form.userId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { order: 'asc' }],
      })
      if (banks.length === 0) {
        return jsonError(
          'Penjual belum setup rekening bank. Coba hubungi langsung.',
          400,
        )
      }
      bankSnapshot = banks.map((b) => ({
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        accountName: b.accountName,
        isDefault: b.isDefault,
      }))
    }

    // 6. Find existing contact by phone (best-effort linking ke WA contact).
    // Customer publik tidak selalu punya kontak WA → contactId null OK.
    const phoneNorm = normalizePhone(data.customerPhone)
    const contact = await prisma.contact.findFirst({
      where: { userId: form.userId, phoneNumber: phoneNorm },
      select: { id: true },
    })

    // 7. Generate invoice + uniqueCode (untuk TRANSFER, tambahkan ke total).
    let invoiceNumber = generateInvoiceNumber()
    // Defensive: kalau bentrok, regenerate up to 5x.
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.userOrder.findUnique({
        where: { invoiceNumber },
        select: { id: true },
      })
      if (!exists) break
      invoiceNumber = generateInvoiceNumber()
    }

    const code = data.paymentMethod === 'TRANSFER' ? uniqueCode() : null
    const finalTotal = code ? pricing.total + code : pricing.total

    // 8. Create order + increment counters in transaction.
    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.userOrder.create({
        data: {
          userId: form.userId,
          contactId: contact?.id ?? null,
          orderFormId: form.id,
          invoiceNumber,
          customerName: data.customerName,
          customerPhone: phoneNorm,
          customerEmail: data.customerEmail ?? null,
          customerAddress: data.shippingAddress,

          shippingProvinceId: null,
          shippingProvinceName: data.shippingProvinceName ?? null,
          shippingCityId: data.shippingDestinationId
            ? String(data.shippingDestinationId)
            : null,
          shippingCityName: data.shippingCityName ?? null,
          shippingAddress: data.shippingAddress,
          shippingPostalCode: data.shippingPostalCode ?? null,

          items: pricing.items as never,
          totalAmount: finalTotal,

          paymentMethod: data.paymentMethod,
          paymentStatus: 'PENDING',
          deliveryStatus: 'PENDING',

          subtotalRp: pricing.subtotal,
          flashSaleDiscountRp: pricing.flashSaleDiscount,
          shippingCourier: pricing.shippingCourier,
          shippingService: pricing.shippingService,
          shippingCostRp: pricing.shippingCost,
          shippingSubsidyRp: pricing.shippingSubsidy,
          shippingEtd: pricing.shippingEtd,
          totalRp: finalTotal,

          appliedZoneId: pricing.appliedZoneId,
          appliedZoneName: pricing.appliedZoneName,

          bankAccountSnapshot:
            bankSnapshot.length > 0 ? (bankSnapshot as never) : undefined,
          uniqueCode: code,

          notes: data.notes ?? null,

          // Pixel attribution (Phase 2 Pixel Tracking).
          fbclid: data.fbclid ?? null,
          gclid: data.gclid ?? null,
          ttclid: data.ttclid ?? null,
          utmSource: data.utmSource ?? null,
          utmMedium: data.utmMedium ?? null,
          utmCampaign: data.utmCampaign ?? null,
        },
      })

      await tx.orderForm.update({
        where: { id: form.id },
        data: { submissions: { increment: 1 } },
      })

      // Increment flashSaleSold per item kalau aktif (best-effort, tidak fatal).
      for (const item of pricing.items.filter((i) => i.isFlashSale)) {
        await tx.product
          .update({
            where: { id: item.productId },
            data: { flashSaleSold: { increment: item.qty } },
          })
          .catch(() => {})
      }

      return order
    })

    // Notif WA owner — fire-and-forget, jangan block response.
    notifyNewOrder(created.id).catch(() => {})

    // Generate follow-up queue (POWER only, gating di engine).
    generateQueueForOrder(created.id, 'ORDER_CREATED').catch((err) => {
      console.error('[orders/submit] followup generate gagal:', err)
    })

    // Pixel server-side fire — COD: Purchase langsung, TRANSFER: Lead saja
    // (Purchase nanti saat admin tandai PAID di /pesanan).
    const pixelEvent = data.paymentMethod === 'COD' ? 'Purchase' : 'Lead'
    firePixelEventForOrder({
      orderId: created.id,
      eventName: pixelEvent,
    }).catch(() => {})

    return jsonOk(
      {
        invoiceNumber: created.invoiceNumber,
        total: finalTotal,
        uniqueCode: code,
      },
      201,
    )
  } catch (err) {
    console.error('[POST /api/orders/submit] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
