// Resolve order form slug untuk Live Room. Tombol "Order" di kartu produk WAJIB
// ke form order (bukan fallback chat host). Kalau room belum set orderFormSlug,
// pakai order form default milik owner — prioritas form yg paling mungkin memuat
// produk yang di-klik:
//   1. orderFormSlug eksplisit di room
//   2. form aktif dengan productIds kosong (= semua produk owner) → universal
//   3. form aktif yang productIds-nya overlap dgn produk room
//   4. form aktif terbaru
import { prisma } from '@/lib/prisma'

export async function resolveLiveOrderFormSlug(input: {
  explicitSlug: string | null
  userId: string
  productIds: string[]
}): Promise<string | null> {
  if (input.explicitSlug) return input.explicitSlug

  const forms = await prisma.orderForm.findMany({
    where: { userId: input.userId, isActive: true },
    select: { slug: true, productIds: true },
    orderBy: { createdAt: 'desc' },
  })
  if (forms.length === 0) return null

  const allProductsForm = forms.find((f) => f.productIds.length === 0)
  if (allProductsForm) return allProductsForm.slug

  const overlap = forms.find((f) =>
    f.productIds.some((pid) => input.productIds.includes(pid)),
  )
  return (overlap ?? forms[0]).slug
}
