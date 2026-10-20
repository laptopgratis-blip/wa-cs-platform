// PUBLIC route — no auth. Customer akses via /order/<slug> dari link share.
// Server fetch form + verify owner masih punya akses Order System + render
// client.
import { notFound } from 'next/navigation'

import { OrderFormPublic } from '@/components/order-public/OrderFormPublic'
import { after } from 'next/server'
import { getPublicOrderSnapshot } from '@/lib/services/orders/public-snapshot'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'  // form punya counter views, jangan cache HTML
export const revalidate = 0

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const snapshot = await getPublicOrderSnapshot(slug)
  const form = snapshot?.form
  if (!form) return { title: 'Form tidak ditemukan' }
  return {
    title: `${form.name} · Hulao`,
    description: form.description ?? `Order ${form.name}`,
  }
}

export default async function PublicOrderPage({ params }: PageProps) {
  const { slug } = await params

  const snapshot = await getPublicOrderSnapshot(slug)
  if (!snapshot) notFound()
  const { form, products, isAvailable } = snapshot

  // Increment views (best-effort, tidak fatal) — jalan setelah respons
  // terkirim supaya statistik tidak menunda form tampil ke pembeli.
  if (isAvailable) {
    after(async () => {
      await prisma.orderForm
        .update({ where: { id: form.id }, data: { views: { increment: 1 } } })
        .catch(() => {})
    })
  }

  return (
    <OrderFormPublic
      form={{
        slug: form.slug,
        name: form.name,
        description: form.description,
        acceptCod: form.acceptCod,
        acceptTransfer: form.acceptTransfer,
        acceptTripay: form.acceptTripay,
        shippingFlatCod: form.shippingFlatCod,
        requireShipping: form.requireShipping,
        showFlashSaleCounter: form.showFlashSaleCounter,
        showShippingPromo: form.showShippingPromo,
        socialProofEnabled: form.socialProofEnabled,
        socialProofPosition: form.socialProofPosition as 'top' | 'bottom',
        socialProofIntervalSec: form.socialProofIntervalSec,
        socialProofShowTime: form.socialProofShowTime,
        socialProofSoundEnabled: form.socialProofSoundEnabled,
        socialProofSound: (form.socialProofSound as 'bell' | 'ding' | 'chime' | 'pop'),
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
        images:
          p.images && p.images.length > 0
            ? p.images
            : p.imageUrl
              ? [p.imageUrl]
              : [],
        stock: p.stock,
        flashSaleActive: p.flashSaleActive,
        flashSalePrice: p.flashSalePrice,
        flashSaleStartAt: p.flashSaleStartAt?.toISOString() ?? null,
        flashSaleEndAt: p.flashSaleEndAt?.toISOString() ?? null,
        flashSaleQuota: p.flashSaleQuota,
        flashSaleSold: p.flashSaleSold,
        // Produk e-book → COD diblokir di form.
        hasEbook: p.ebookId != null,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: v.price,
          flashSalePrice: v.flashSalePrice,
          weightGrams: v.weightGrams,
          stock: v.stock,
          imageUrl: v.imageUrl,
        })),
      }))}
    />
  )
}
