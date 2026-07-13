import { z } from 'zod'

// Multi-gudang (Fase 1). Limit per user supaya UI tidak penuh & cost-compare
// selector tetap ringan (kandidat di-cap terpisah di selector).
export const WAREHOUSE_LIMIT_PER_USER = 10

// originId = Komerce destination ID (dari DestinationPicker). cityName =
// label lengkap dari Komerce ("KEL, KEC, KOTA, PROV, ZIP"). provinceName =
// province_name — dipakai server untuk derive regionCode (prefilter selector).
// regionCode TIDAK diterima dari client (di-derive server) supaya konsisten.
export const warehouseCreateSchema = z.object({
  name: z.string().min(1, 'Nama gudang wajib diisi').max(60),
  originId: z.number().int().positive('Pilih kota asal gudang dulu'),
  cityName: z.string().min(1, 'Kota asal wajib diisi').max(160),
  provinceName: z.string().max(120).optional().default(''),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export const warehouseUpdateSchema = warehouseCreateSchema.partial()

export type WarehouseCreateInput = z.infer<typeof warehouseCreateSchema>
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateSchema>
