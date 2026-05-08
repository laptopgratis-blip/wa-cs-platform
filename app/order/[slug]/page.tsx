// PUBLIC route — no auth. Customer akses via /order/<slug> dari link share.
// Server fetch form + verify owner masih aktif POWER + render client.
import { notFound } from 'next/navigation'

import { OrderFormPublic } from '@/components/order-public/OrderFormPublic'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'  // form punya counter views, jangan cache HTML
export const revalidate = 0

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const form = await prisma.orderForm.findUnique({
    where: { slug },
    select: { name: true, description: true, isActive: true },
  })
  if (!form) return { title: 'Form tidak ditemukan' }
  return {
    title: `${form.name} · Hulao`,
    description: form.description ?? `Order ${form.name}`,
  }
}

export default async function PublicOrderPage({ params }: PageProps) {
  const { slug } = await params

  const form = await prisma.orderForm.findUnique({
    where: { slug },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          shippingProfile: {
            select: {
              originCityId: true,
              originCityName: true,
              enabledCouriers: true,
              defaultWeightGrams: true,
            },
          },
        },
      },
    },
  })

  if (!form) notFound()

  // Cek akses owner (paket POWER aktif).
  const access = await checkOrderSystemAccess(form.userId)
  const isAvailable = form.isActive && access.hasAccess

  // Increment views (best-effort, tidak fatal).
  if (isAvailable) {
    prisma.orderForm
      .update({ where: { id: form.id }, data: { views: { increment: 1 } } })
      .catch(() => {})
  }

  // Fetch produk yang ditampilkan.
  const productWhere =
    form.productIds.length > 0
      ? { id: { in: form.productIds }, userId: form.userId, isActive: true }
      : { userId: form.userId, isActive: true }
  const products = await prisma.product.findMany({
    where: productWhere,
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    include: {
      // Hanya varian aktif yang dikirim ke client. Customer tidak boleh
      // pilih varian off — sama logic-nya dengan product.isActive.
      variants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  return (
    <OrderFormPublic
      form={{
        slug: form.slug,
        name: form.name,
        description: form.description,
        acceptCod: form.acceptCod,
        acceptTransfer: form.acceptTransfer,
        shippingFlatCod: form.shippingFlatCod,
        showFlashSaleCounter: form.showFlashSaleCounter,
        showShippingPromo: form.showShippingPromo,
        ownerName: form.user.name ?? 'Penjual',
      }}
      isAvailable={isAvailable}
      hasOriginSetup={!!form.user.shippingProfile?.originCityId}
      enabledCouriers={form.user.shippingProfile?.enabledCouriers ?? []}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        weightGrams: p.weightGrams,
        imageUrl: p.imageUrl,
        stock: p.stock,
        flashSaleActive: p.flashSaleActive,
        flashSalePrice: p.flashSalePrice,
        flashSaleStartAt: p.flashSaleStartAt?.toISOString() ?? null,
        flashSaleEndAt: p.flashSaleEndAt?.toISOString() ?? null,
        flashSaleQuota: p.flashSaleQuota,
        flashSaleSold: p.flashSaleSold,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: v.price,
          weightGrams: v.weightGrams,
          stock: v.stock,
          imageUrl: v.imageUrl,
        })),
      }))}
    />
  )
}
