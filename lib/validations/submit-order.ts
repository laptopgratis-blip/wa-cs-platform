import { z } from 'zod'

// Submit order public — dipakai endpoint POST /api/orders/submit (no-auth).
// Validasi minimal supaya tidak break pricing engine yang membutuhkan field
// lengkap saat customer pilih TRANSFER.

export const submitOrderItemSchema = z.object({
  productId: z.string().min(1),
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
    shippingAddress: z.string().min(5, 'Alamat lengkap wajib diisi').max(500),

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
