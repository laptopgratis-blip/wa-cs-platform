// PUBLIC route — no auth. Customer dapat link ke /invoice/<invoiceNumber>
// setelah submit form order. Tampil breakdown harga + opsi pembayaran +
// upload bukti / kirim via WA.
import { notFound } from 'next/navigation'

import { InvoicePublic } from '@/components/order-public/InvoicePublic'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ invoiceNumber: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { invoiceNumber } = await params
  return { title: `Invoice ${invoiceNumber} · Hulao` }
}

export default async function InvoicePage({ params }: PageProps) {
  const { invoiceNumber } = await params

  const order = await prisma.userOrder.findUnique({
    where: { invoiceNumber },
    include: {
      user: {
        select: {
          name: true,
          shippingProfile: {
            select: {
              waConfirmNumber: true,
              waConfirmTemplate: true,
              waConfirmActive: true,
            },
          },
        },
      },
    },
  })

  if (!order) notFound()

  // Pixel tracking — load pixel yang aktif untuk OrderForm asal order
  // supaya invoice page bisa fire AddPaymentInfo (Transfer browser-side).
  let pixels: Array<{ id: string; platform: string; pixelId: string }> = []
  if (order.orderFormId) {
    const form = await prisma.orderForm.findUnique({
      where: { id: order.orderFormId },
      select: { enabledPixelIds: true },
    })
    if (form && form.enabledPixelIds.length > 0) {
      const found = await prisma.pixelIntegration.findMany({
        where: { id: { in: form.enabledPixelIds }, isActive: true },
        select: { id: true, platform: true, pixelId: true },
      })
      pixels = found
    }
  }

  // Snapshot bank dari saat submit (kalau user hapus rekening, invoice lama
  // tetap valid).
  const banks = (order.bankAccountSnapshot as Array<{
    bankName: string
    accountNumber: string
    accountName: string
    isDefault: boolean
  }> | null) ?? []

  return (
    <InvoicePublic
      order={{
        invoiceNumber: order.invoiceNumber!,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        shippingAddress: order.shippingAddress,
        shippingCityName: order.shippingCityName,
        shippingProvinceName: order.shippingProvinceName,
        shippingPostalCode: order.shippingPostalCode,

        items:
          (order.items as Array<{
            productId: string
            name: string
            price: number
            originalPrice: number
            qty: number
            isFlashSale: boolean
          }>) ?? [],

        subtotalRp: order.subtotalRp,
        flashSaleDiscountRp: order.flashSaleDiscountRp,
        shippingCourier: order.shippingCourier,
        shippingService: order.shippingService,
        shippingCostRp: order.shippingCostRp,
        shippingSubsidyRp: order.shippingSubsidyRp,
        appliedZoneName: order.appliedZoneName,
        totalRp: order.totalRp,
        uniqueCode: order.uniqueCode,

        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentProofUrl: order.paymentProofUrl,
        deliveryStatus: order.deliveryStatus,
        trackingNumber: order.trackingNumber,
        createdAt: order.createdAt.toISOString(),
      }}
      banks={banks}
      ownerName={order.user.name ?? 'Penjual'}
      pixels={pixels}
      waConfirm={
        order.user.shippingProfile?.waConfirmActive &&
        order.user.shippingProfile.waConfirmNumber
          ? {
              number: order.user.shippingProfile.waConfirmNumber,
              template: order.user.shippingProfile.waConfirmTemplate,
            }
          : null
      }
    />
  )
}
