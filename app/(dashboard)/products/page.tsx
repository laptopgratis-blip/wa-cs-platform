import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { CsAiPromoBanner } from '@/components/products/CsAiPromoBanner'
import { ProductsClient } from '@/components/products/ProductsClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { PageContainer } from '@/components/shared/PageContainer'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { buildCsSessionOptions } from '@/lib/services/products/cs-session-options'
import { PRODUCT_LIMIT_PER_USER } from '@/lib/validations/product'

export const metadata = {
  title: 'Produk · Hulao',
}

export default async function ProductsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const access = await checkOrderSystemAccess(session.user.id)
  if (!access.hasAccess) {
    return <UpgradeRequired currentTier={access.currentTier} feature="Produk" />
  }

  const products = await prisma.product.findMany({
    where: { userId: session.user.id },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    include: {
      variants: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  // Opsi "CS WhatsApp" per produk: nomor yang sedang terhubung + sesi yang
  // sedang dipakai produk walau offline (supaya pilihan tersimpan tetap
  // terlihat). Baris tanpa nomor (belum pernah pair) tidak diambil.
  // Pengelompokan per nomor: lib/services/products/cs-session-options.ts.
  const csSessionIdsInUse = products.flatMap((p) =>
    p.csSessionId ? [p.csSessionId] : [],
  )
  const waSessions = await prisma.whatsappSession.findMany({
    where: {
      userId: session.user.id,
      phoneNumber: { not: null },
      OR: [
        { status: 'CONNECTED', isActive: true },
        { id: { in: csSessionIdsInUse } },
      ],
    },
    select: {
      id: true,
      displayName: true,
      phoneNumber: true,
      provider: true,
      status: true,
      isActive: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })
  const csSessionOptions = buildCsSessionOptions(waSessions, csSessionIdsInUse)

  return (
    <PageContainer>
      <CsAiPromoBanner userId={session.user.id} />
      <ProductsClient
        initialProducts={products.map((p) => ({
          ...p,
          images: p.images ?? [],
          flashSaleStartAt: p.flashSaleStartAt?.toISOString() ?? null,
          flashSaleEndAt: p.flashSaleEndAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          variants: p.variants.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            price: v.price,
            flashSalePrice: v.flashSalePrice,
            weightGrams: v.weightGrams,
            stock: v.stock,
            imageUrl: v.imageUrl,
            isActive: v.isActive,
            sortOrder: v.sortOrder,
          })),
        }))}
        limit={PRODUCT_LIMIT_PER_USER}
        csSessionOptions={csSessionOptions}
      />
    </PageContainer>
  )
}
