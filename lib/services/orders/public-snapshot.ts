import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { createSnapshotCache } from './snapshot-cache'

// Data form order publik untuk TAMPILAN saja, di-cache 3 detik per slug
// (meredam lonjakan trafik iklan — dipulihkan dari WIP produksi 2026-10-16).
// Submit (app/api/orders/submit) tetap cek ulang ke database.
export const getPublicOrderSnapshot = createSnapshotCache(async (slug: string) => {
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

  if (!form) return null

  // Cek akses owner (langganan hidup ber-flag canUseOrderSystem).
  const access = await checkOrderSystemAccess(form.userId)
  const isAvailable = form.isActive && access.hasAccess

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

  return { form, products, isAvailable }
})
