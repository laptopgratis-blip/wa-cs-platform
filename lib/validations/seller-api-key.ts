// Schema validasi kunci API publik milik seller (/pengembang/api).
import { z } from 'zod'

// Pilihan masa berlaku sengaja dibatasi supaya UI cukup <Select> dan tidak
// perlu date picker. null = tidak pernah kedaluwarsa (default) — expiry wajib
// akan mematikan integrasi n8n orang tanpa peringatan.
export const API_KEY_EXPIRY_OPTIONS = [30, 90, 365] as const

// Ditaruh di file validasi (bukan di service) supaya komponen client bisa
// mengimpornya tanpa ikut menarik Prisma ke bundle browser.
export const MAX_ACTIVE_KEYS_PER_USER = 5

export const sellerApiKeyCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(60, 'Nama maksimal 60 karakter'),
  expiresInDays: z
    .union([z.literal(30), z.literal(90), z.literal(365), z.null()])
    .optional()
    .default(null),
})

export type SellerApiKeyCreateInput = z.infer<typeof sellerApiKeyCreateSchema>

export const EXPIRY_LABELS: Record<string, string> = {
  null: 'Tidak pernah kedaluwarsa',
  '30': '30 hari',
  '90': '90 hari',
  '365': '1 tahun',
}
