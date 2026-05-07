import { z } from 'zod'

export const SHIPPING_ZONE_LIMIT_PER_USER = 30

export const SUBSIDY_TYPES = ['NONE', 'FLAT_AMOUNT', 'PERCENT', 'FREE'] as const
export const MATCH_TYPES = ['ALL', 'CITY', 'PROVINCE'] as const

// Zona tujuan dipakai sebagai snapshot ID + nama untuk display tanpa hit
// Komerce lagi. Dari Komerce destination response: id (subdistrict), city_name,
// province_name. Untuk match level CITY kita pakai city_name (case-sensitive
// tapi Komerce konsisten UPPERCASE).
const shippingZoneBaseSchema = z.object({
  name: z.string().min(1, 'Nama zona wajib diisi').max(80),
  matchType: z.enum(MATCH_TYPES),
  cityIds: z.array(z.string()).default([]),
  provinceIds: z.array(z.string()).default([]),
  cityNames: z.array(z.string()).default([]),
  provinceNames: z.array(z.string()).default([]),
  subsidyType: z.enum(SUBSIDY_TYPES),
  subsidyValue: z.number().min(0).default(0),
  minimumOrder: z.number().min(0).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
})

export const shippingZoneCreateSchema = shippingZoneBaseSchema
  .refine(
    (v) => {
      if (v.matchType === 'CITY') return v.cityNames.length > 0
      if (v.matchType === 'PROVINCE') return v.provinceNames.length > 0
      return true
    },
    {
      message: 'Pilih minimal 1 kota / provinsi sesuai tipe match',
      path: ['cityNames'],
    },
  )
  .refine(
    (v) => {
      if (v.subsidyType === 'PERCENT')
        return v.subsidyValue > 0 && v.subsidyValue <= 100
      if (v.subsidyType === 'FLAT_AMOUNT') return v.subsidyValue > 0
      return true
    },
    {
      message:
        'Nilai subsidi harus > 0 (untuk PERCENT max 100, untuk FLAT minimal 1)',
      path: ['subsidyValue'],
    },
  )

// Update schema: partial dari base (tanpa refinement supaya tiap field
// bebas dikirim sendiri-sendiri di PATCH).
export const shippingZoneUpdateSchema = shippingZoneBaseSchema.partial()

export type ShippingZoneCreateInput = z.infer<typeof shippingZoneCreateSchema>
export type ShippingZoneUpdateInput = z.infer<typeof shippingZoneUpdateSchema>
