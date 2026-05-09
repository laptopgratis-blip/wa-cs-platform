// Zod schema untuk Soul (create + update) dan untuk konfigurasi WA session.
import { z } from 'zod'

export const languageEnum = z.enum(['id', 'en', 'mix'])

// personality & replyStyle sekarang berisi id dari SoulPersonality / SoulStyle
// yang dikurasi admin (cuid). Validasi keberadaan id-nya dilakukan di handler
// (resolve lewat lib/soul.ts) — di sini cukup string bebas + nullable supaya
// row Soul lama (yang menyimpan enum legacy) tetap bisa di-update.
const optionalIdString = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .optional()
  .nullable()

export const soulCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama soul minimal 2 karakter').max(80),
  personality: optionalIdString,
  language: languageEnum,
  replyStyle: optionalIdString,
  // Sengaja dibatasi 1500 char (~375 token). Tujuan: cuma info produk inti
  // (harga, fitur singkat) supaya tidak boros token tiap reply. FAQ, kebijakan
  // return, jam buka, alamat, testimoni → simpan di /knowledge (di-retrieve
  // by keyword saat butuh, jadi tidak ikut overhead di setiap pesan).
  businessContext: z
    .string()
    .max(1500, 'Konteks bisnis maksimal 1500 karakter — pindahkan FAQ & info detail ke /knowledge supaya tidak boros token')
    .optional()
    .nullable(),
  isDefault: z.boolean().optional(),
})

export const soulUpdateSchema = soulCreateSchema.partial()

export type SoulCreateInput = z.infer<typeof soulCreateSchema>
export type SoulUpdateInput = z.infer<typeof soulUpdateSchema>

// Untuk PATCH /api/whatsapp/[sessionId]/config
export const sessionConfigSchema = z.object({
  soulId: z.string().min(1).nullable().optional(),
  modelId: z.string().min(1).nullable().optional(),
})
export type SessionConfigInput = z.infer<typeof sessionConfigSchema>
