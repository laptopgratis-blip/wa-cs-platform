import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { ProductsClient } from '@/components/products/ProductsClient'
import { UpgradeRequired } from '@/components/order-system/UpgradeRequired'
import { authOptions } from '@/lib/auth'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
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

  return (
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
          weightGrams: v.weightGrams,
          stock: v.stock,
          imageUrl: v.imageUrl,
          isActive: v.isActive,
          sortOrder: v.sortOrder,
        })),
      }))}
      limit={PRODUCT_LIMIT_PER_USER}
    />
  )
}
