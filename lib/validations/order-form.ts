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
  // false = produk digital — form tidak akan minta alamat, ongkir di-skip.
  requireShipping: z.boolean().default(true),
  showFlashSaleCounter: z.boolean().default(true),
  showShippingPromo: z.boolean().default(true),
  // Social Proof popup di public form. Data ditarik dari UserOrder PAID milik
  // form owner. Interval 3-30 detik supaya tidak terlalu spammy / terlalu jarang.
  socialProofEnabled: z.boolean().default(false),
  socialProofPosition: z.enum(['top', 'bottom']).default('bottom'),
  socialProofIntervalSec: z.number().int().min(3).max(30).default(8),
  // Toggle tampilkan timestamp pembelian. Off → hilangkan "X hari lalu"
  // supaya pembeli lama tetap berfungsi sebagai social proof tanpa counter-
  // productive sense of staleness.
  socialProofShowTime: z.boolean().default(true),
  // Source data popup. PAID = hanya order yang sudah lunas (paling jujur).
  // ALL = semua status order termasuk PENDING. Cocok untuk form baru yang
  // belum punya order PAID supaya popup tetap punya konten.
  socialProofSource: z.enum(['PAID', 'ALL']).default('PAID'),
  isActive: z.boolean().default(true),
  // Pixel tracking (Phase 2 Pixel) — PixelIntegration.id yg aktif untuk form.
  enabledPixelIds: z.array(z.string()).default([]),
})

export const orderFormUpdateSchema = orderFormCreateSchema.partial()

export type OrderFormCreateInput = z.infer<typeof orderFormCreateSchema>
export type OrderFormUpdateInput = z.infer<typeof orderFormUpdateSchema>
