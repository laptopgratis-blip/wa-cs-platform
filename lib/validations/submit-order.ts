import { z } from 'zod'

// Submit order public — dipakai endpoint POST /api/orders/submit (no-auth).
// Validasi minimal supaya tidak break pricing engine yang membutuhkan field
// lengkap saat customer pilih TRANSFER.

export const submitOrderItemSchema = z.object({
  productId: z.string().min(1),
  // variantId opsional — null/undefined kalau produk tidak punya varian.
  // Server akan reject kalau produk yang punya varian tapi item tidak kasih
  // variantId (atau sebaliknya).
  variantId: z.string().min(1).nullable().optional(),
  qty: z.number().int().min(1).max(1000),
})

export const submitOrderSchema = z
  .object({
    slug: z.string().min(1, 'Slug form tidak valid'),

    // Customer info
    customerName: z.string().min(1, 'Nama wajib diisi').max(100),
    customerPhone: z
      .string()
      .min(8, 'Nomor HP tidak valid')
      .max(20)
      .regex(/^[0-9+\- ]+$/, 'Hanya angka, +, -, spasi'),
    customerEmail: z.string().email().nullable().optional(),

    // Items (minimal 1)
    items: z.array(submitOrderItemSchema).min(1, 'Pilih minimal 1 produk'),

    // Address
    shippingDestinationId: z.number().int().positive().optional(),
    shippingProvinceName: z.string().nullable().optional(),
    shippingCityName: z.string().nullable().optional(),
    shippingDistrictName: z.string().nullable().optional(),
    shippingSubdistrictName: z.string().nullable().optional(),
    shippingPostalCode: z.string().nullable().optional(),
    // Opsional — wajib hanya kalau form butuh alamat (server-side check).
    // Kalau diisi, minimal 5 karakter; kalau kosong, biarkan null/undefined.
    shippingAddress: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .refine(
        (v) => v == null || v.trim().length === 0 || v.trim().length >= 5,
        'Alamat lengkap minimal 5 karakter',
      ),

    // Payment
    paymentMethod: z.enum(['COD', 'TRANSFER']),

    // Shipping (untuk TRANSFER, RajaOngkir-based)
    shippingCourier: z.string().nullable().optional(),
    shippingService: z.string().nullable().optional(),

    notes: z.string().max(1000).nullable().optional(),

    // Pixel attribution metadata (Phase 2 Pixel Tracking) — di-capture
    // dari URL params di public form, dipakai server-side untuk match
    // Meta CAPI / Google Ads conversion / TikTok Events API.
    fbclid: z.string().max(500).nullable().optional(),
    gclid: z.string().max(500).nullable().optional(),
    ttclid: z.string().max(500).nullable().optional(),
    utmSource: z.string().max(200).nullable().optional(),
    utmMedium: z.string().max(200).nullable().optional(),
    utmCampaign: z.string().max(200).nullable().optional(),
  })
  .refine(
    (v) => {
      // Untuk TRANSFER, butuh destination + courier + service.
      if (v.paymentMethod === 'TRANSFER') {
        return (
          !!v.shippingDestinationId &&
          !!v.shippingCourier &&
          !!v.shippingService
        )
      }
      return true
    },
    {
      message: 'Untuk Transfer Bank, pilih kurir dulu',
      path: ['shippingCourier'],
    },
  )

export type SubmitOrderInput = z.infer<typeof submitOrderSchema>
