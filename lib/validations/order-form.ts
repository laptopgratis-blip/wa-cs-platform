import { z } from 'zod'

export const ORDER_FORM_LIMIT_PER_USER = 20

export const orderFormCreateSchema = z.object({
  name: z.string().min(1, 'Nama form wajib diisi').max(100),
  description: z.string().max(2000).nullable().optional(),
  // Subset Product.id yang ditampilkan. Kosong = tampilkan semua produk aktif.
  productIds: z.array(z.string()).default([]),
  acceptCod: z.boolean().default(true),
  acceptTransfer: z.boolean().default(true),
  shippingFlatCod: z.number().min(0).nullable().optional(),
  showFlashSaleCounter: z.boolean().default(true),
  showShippingPromo: z.boolean().default(true),
  isActive: z.boolean().default(true),
  // Pixel tracking (Phase 2 Pixel) — PixelIntegration.id yg aktif untuk form.
  enabledPixelIds: z.array(z.string()).default([]),
})

export const orderFormUpdateSchema = orderFormCreateSchema.partial()

export type OrderFormCreateInput = z.infer<typeof orderFormCreateSchema>
export type OrderFormUpdateInput = z.infer<typeof orderFormUpdateSchema>
