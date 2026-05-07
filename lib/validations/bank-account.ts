import { z } from 'zod'

// Limit per user supaya UI tidak penuh & seller fokus pakai 1-3 rekening saja.
export const BANK_ACCOUNT_LIMIT_PER_USER = 5

// Daftar bank populer di Indonesia. Dropdown di UI; user bisa pakai yang lain
// dengan input bebas (selain list ini akan dianggap "OTHER" tapi tetap valid
// asal nama tidak kosong).
export const BANK_OPTIONS = [
  'BCA',
  'Mandiri',
  'BRI',
  'BNI',
  'Permata',
  'CIMB Niaga',
  'BTN',
  'Bank Jago',
  'Bank Mega',
  'BSI',
  'Danamon',
  'OCBC NISP',
  'SeaBank',
  'Lainnya',
] as const

export const bankAccountCreateSchema = z.object({
  bankName: z.string().min(1, 'Nama bank wajib diisi').max(50),
  accountNumber: z
    .string()
    .min(5, 'Nomor rekening minimal 5 digit')
    .max(30, 'Nomor rekening terlalu panjang')
    .regex(/^[0-9-]+$/, 'Hanya angka & strip yang diperbolehkan'),
  accountName: z.string().min(1, 'Nama pemilik wajib diisi').max(100),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export const bankAccountUpdateSchema = bankAccountCreateSchema.partial()

export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>
export type BankAccountUpdateInput = z.infer<typeof bankAccountUpdateSchema>

// Schema PATCH /api/shipping-profile — Phase 1: WA confirm. Phase 2: origin
// kota asal + kurir aktif. Semua field optional supaya bisa partial-update.
export const shippingProfileSchema = z.object({
  // Format: 6281234567890 (no '+', no '0' di depan).
  waConfirmNumber: z
    .string()
    .regex(
      /^62\d{8,15}$/,
      'Format harus 62xxx (mis. 6281234567890), tanpa + atau 0 di depan',
    )
    .nullable()
    .optional(),
  waConfirmTemplate: z
    .string()
    .max(2000, 'Template terlalu panjang (max 2000 karakter)')
    .nullable()
    .optional(),
  waConfirmActive: z.boolean().optional(),

  // Origin kota asal (Phase 2). Komerce destination ID disimpan sbg string,
  // origin label = full label dari Komerce ("KEL, KEC, KOTA, PROV, ZIP").
  originCityId: z.string().nullable().optional(),
  originCityName: z.string().nullable().optional(),
  originProvinceName: z.string().nullable().optional(),

  enabledCouriers: z
    .array(z.enum(['jne', 'sicepat', 'jnt', 'anteraja']))
    .optional(),
  defaultWeightGrams: z
    .number()
    .int()
    .min(1)
    .max(150_000)
    .optional(),
})

// Alias untuk kompat dgn import lama (Phase 1).
export const shippingProfileWaSchema = shippingProfileSchema
export type ShippingProfileInput = z.infer<typeof shippingProfileSchema>

// Default template pesan WA — di-fallback di UI kalau user belum customize.
export const DEFAULT_WA_CONFIRM_TEMPLATE = `Halo kak, ini bukti transfer untuk pesanan #{invoiceNumber}.

Total: Rp {totalRp}
Bank: {bankName} a.n. {accountName}

Mohon dicek ya, terima kasih 🙏`
