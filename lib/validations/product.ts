import { z } from 'zod'

// Limit produk per user supaya storage & UI tetap manageable.
export const PRODUCT_LIMIT_PER_USER = 100
// Cap varian per produk supaya tidak meledak (ribuan baris) yang nyusahin
// pricing engine dan UI selector.
export const VARIANT_LIMIT_PER_PRODUCT = 50
// Maksimal foto galeri per produk (carousel di form publik).
export const PRODUCT_IMAGES_LIMIT = 10

// Schema satu varian saat user submit dari dialog produk. Dipakai PATCH
// /api/products/[id] untuk full-replace varian.
// `id` opsional: kalau ada → varian existing yang di-update; kalau tidak →
// varian baru yang akan di-create.
export const productVariantInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, 'Nama varian wajib diisi').max(80),
  sku: z.string().trim().max(80).nullable().optional(),
  price: z
    .number()
    .min(0, 'Harga varian tidak boleh negatif')
    .max(1_000_000_000),
  weightGrams: z.number().int().min(1).max(150_000),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export type ProductVariantInput = z.infer<typeof productVariantInputSchema>

export const productCreateSchema = z
  .object({
    name: z.string().min(1, 'Nama produk wajib diisi').max(100),
    description: z.string().max(2000).nullable().optional(),
    price: z
      .number()
      .min(0, 'Harga tidak boleh negatif')
      .max(1_000_000_000, 'Harga terlalu besar'),
    weightGrams: z
      .number()
      .int()
      .min(1, 'Berat minimal 1 gram')
      .max(150_000, 'Berat maksimal 150 kg'),
    imageUrl: z.string().nullable().optional(),
    // Galeri multi-image. Server akan derive imageUrl = images[0] kalau ada.
    images: z
      .array(z.string().min(1))
      .max(PRODUCT_IMAGES_LIMIT, `Maksimal ${PRODUCT_IMAGES_LIMIT} foto per produk`)
      .optional(),
    // null = unlimited stock.
    stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
    isActive: z.boolean().optional(),
    order: z.number().int().min(0).optional(),

    // Flash sale (Phase 4 UI). flashSaleActive=true butuh price+start+end.
    // flashSaleSold di-manage internal — tidak terima dari client.
    flashSaleActive: z.boolean().optional(),
    flashSalePrice: z.number().min(0).nullable().optional(),
    flashSaleStartAt: z.string().datetime().nullable().optional(),
    flashSaleEndAt: z.string().datetime().nullable().optional(),
    flashSaleQuota: z.number().int().min(1).max(1_000_000).nullable().optional(),

    // Varian (Phase 5). Optional di create — biasanya user tambah belakangan
    // via edit. Kalau diisi pas create, akan di-create sekaligus.
    variants: z
      .array(productVariantInputSchema)
      .max(VARIANT_LIMIT_PER_PRODUCT, `Maksimal ${VARIANT_LIMIT_PER_PRODUCT} varian per produk`)
      .optional(),
  })
  .refine(
    (v) => {
      if (!v.flashSaleActive) return true
      // Saat aktif, butuh harga diskon < harga normal + start < end + start dimasa depan/sekarang OK
      if (v.flashSalePrice == null || v.flashSalePrice <= 0) return false
      if (v.flashSalePrice >= v.price) return false
      if (!v.flashSaleStartAt || !v.flashSaleEndAt) return false
      if (new Date(v.flashSaleStartAt) >= new Date(v.flashSaleEndAt))
        return false
      return true
    },
    {
      message:
        'Flash sale aktif butuh: harga diskon < harga normal, tanggal mulai < selesai',
      path: ['flashSalePrice'],
    },
  )

// Update schema: pakai base partial supaya flash sale field bisa di-patch
// sendiri-sendiri tanpa kena refine yang butuh price.
const productBaseSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).nullable(),
  price: z.number().min(0).max(1_000_000_000),
  weightGrams: z.number().int().min(1).max(150_000),
  imageUrl: z.string().nullable(),
  images: z
    .array(z.string().min(1))
    .max(PRODUCT_IMAGES_LIMIT, `Maksimal ${PRODUCT_IMAGES_LIMIT} foto per produk`),
  stock: z.number().int().min(0).max(1_000_000).nullable(),
  isActive: z.boolean(),
  order: z.number().int().min(0),
  flashSaleActive: z.boolean(),
  flashSalePrice: z.number().min(0).nullable(),
  flashSaleStartAt: z.string().datetime().nullable(),
  flashSaleEndAt: z.string().datetime().nullable(),
  flashSaleQuota: z.number().int().min(1).max(1_000_000).nullable(),
  // Varian — kalau dikirim, server akan replace seluruh varian existing
  // (delete yang tidak ada di payload, update yang ID-nya match, create yang
  // tidak punya ID).
  variants: z
    .array(productVariantInputSchema)
    .max(VARIANT_LIMIT_PER_PRODUCT),
})

export const productUpdateSchema = productBaseSchema.partial()

export type ProductCreateInput = z.infer<typeof productCreateSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>
