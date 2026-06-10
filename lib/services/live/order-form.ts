// Resolve order form untuk Live Room. Tombol "Order" di kartu produk WAJIB
// ke form order (bukan fallback chat host).
//
// Arsitektur "default + override per-produk":
//   - LiveRoom.orderFormSlug   = form DEFAULT room
//   - LiveRoom.productFormMap  = JSON { [productId]: formSlug } override per produk
// Resolusi saat viewer klik produk: map[productId] ?? defaultSlug.
//
// Kalau room belum set orderFormSlug, pakai order form default milik owner —
// prioritas form yg paling mungkin memuat produk yang di-klik:
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

// Resolusi lengkap untuk halaman /live/[slug]: form default + map per-produk.
// Map di-RE-validasi di sini (bukan cuma saat simpan) karena form bisa
// dinonaktifkan/dihapus setelah mapping dibuat → entri basi di-skip dan
// produk itu fallback ke default.
export async function resolveLiveOrderForms(input: {
  explicitSlug: string | null
  rawProductFormMap: unknown
  userId: string
  productIds: string[]
}): Promise<{
  defaultSlug: string | null
  productFormMap: Record<string, string>
}> {
  const defaultSlug = await resolveLiveOrderFormSlug({
    explicitSlug: input.explicitSlug,
    userId: input.userId,
    productIds: input.productIds,
  })

  const raw =
    input.rawProductFormMap &&
    typeof input.rawProductFormMap === 'object' &&
    !Array.isArray(input.rawProductFormMap)
      ? (input.rawProductFormMap as Record<string, unknown>)
      : {}
  const entries = Object.entries(raw).filter(
    (e): e is [string, string] =>
      typeof e[1] === 'string' &&
      e[1].length > 0 &&
      input.productIds.includes(e[0]),
  )
  if (entries.length === 0) return { defaultSlug, productFormMap: {} }

  const slugs = [...new Set(entries.map(([, s]) => s))]
  const forms = await prisma.orderForm.findMany({
    where: { slug: { in: slugs }, userId: input.userId, isActive: true },
    select: { slug: true, productIds: true },
  })
  const formBySlug = new Map(forms.map((f) => [f.slug, f]))

  const productFormMap: Record<string, string> = {}
  for (const [pid, slug] of entries) {
    if (slug === defaultSlug) continue // redundan — biar payload client kecil
    const f = formBySlug.get(slug)
    if (!f) continue
    if (f.productIds.length === 0 || f.productIds.includes(pid)) {
      productFormMap[pid] = slug
    }
  }
  return { defaultSlug, productFormMap }
}

// Bersihkan productFormMap saat SIMPAN (POST/PUT live-rooms). Entri invalid
// di-DROP (bukan reject) supaya save tetap jalan: produk harus termasuk produk
// room, form harus milik owner + aktif + memuat produk itu (atau universal).
// Return null kalau hasil akhir kosong (disimpan sebagai DbNull).
export async function sanitizeProductFormMap(input: {
  rawMap: Record<string, string>
  userId: string
  productIds: string[]
}): Promise<Record<string, string> | null> {
  const entries = Object.entries(input.rawMap).filter(([pid]) =>
    input.productIds.includes(pid),
  )
  if (entries.length === 0) return null

  const slugs = [...new Set(entries.map(([, s]) => s))]
  const forms = await prisma.orderForm.findMany({
    where: { slug: { in: slugs }, userId: input.userId, isActive: true },
    select: { slug: true, productIds: true },
  })
  const formBySlug = new Map(forms.map((f) => [f.slug, f]))

  const cleaned: Record<string, string> = {}
  for (const [pid, slug] of entries) {
    const f = formBySlug.get(slug)
    if (!f) continue
    if (f.productIds.length === 0 || f.productIds.includes(pid)) {
      cleaned[pid] = slug
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null
}
