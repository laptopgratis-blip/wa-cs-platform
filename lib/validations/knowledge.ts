// Zod schema untuk UserKnowledge.
//
// contentType disimpan sebagai string di DB (bukan enum) supaya gampang
// nambah jenis baru, tapi di API layer kita batasi ke 4 nilai berikut.
import { z } from 'zod'

export const KNOWLEDGE_TYPES = ['TEXT', 'IMAGE', 'FILE', 'LINK'] as const
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number]

export const KNOWLEDGE_LIMIT_PER_USER = 30

const titleField = z.string().trim().min(2, 'Judul minimal 2 karakter').max(120)
const captionField = z
  .string()
  .trim()
  .max(1000, 'Caption maksimal 1000 karakter')
  .optional()
  .nullable()
const textContentField = z
  .string()
  .trim()
  .min(1, 'Isi tidak boleh kosong')
  .max(2000, 'Isi maksimal 2000 karakter')
const linkUrlField = z.string().trim().url('URL tidak valid').max(500)

// Path persis yang ditulis route upload (app/api/knowledge/upload): satu
// segmen userId + nama file hex.ext. Tanpa skema/host, subfolder,
// %-encoding, atau '..' → aman dari traversal. WAJIB ketat: fileUrl dipakai
// wa-service sebagai URL yang di-fetch Baileys dari dalam network docker,
// jadi URL bebas dari seller = SSRF (mis. http://hulao-postgres).
export const KNOWLEDGE_FILE_URL =
  /^\/uploads\/knowledge\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\.([A-Za-z0-9]{1,5})$/

const FILE_URL_INVALID = 'File harus di-upload lewat form Pengetahuan'

/** fileUrl = file hasil upload knowledge milik `userId` (bukan user lain). */
export function isOwnKnowledgeFileUrl(
  fileUrl: string | null | undefined,
  userId: string,
): fileUrl is string {
  if (!fileUrl || !userId) return false
  const match = KNOWLEDGE_FILE_URL.exec(fileUrl)
  return match !== null && match[1] === userId
}

// Skema hanya bisa cek bentuk path; kepemilikan (segmen userId = user sesi)
// dicek di route lewat isOwnKnowledgeFileUrl.
const fileUrlField = z
  .string()
  .trim()
  .min(1, 'File belum di-upload')
  .max(500)
  .regex(KNOWLEDGE_FILE_URL, FILE_URL_INVALID)

const keywordsField = z
  .array(
    z
      .string()
      .trim()
      .min(2, 'Setiap kata kunci minimal 2 karakter')
      .max(40, 'Setiap kata kunci maksimal 40 karakter'),
  )
  .max(20, 'Maksimal 20 kata kunci')
  .default([])

// Discriminated union berdasarkan contentType — masing-masing tipe mensyaratkan
// field yang relevan. AI akan reject kalau struktur salah.
const baseFields = {
  title: titleField,
  caption: captionField,
  triggerKeywords: keywordsField,
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
}

export const knowledgeCreateSchema = z.discriminatedUnion('contentType', [
  z.object({
    contentType: z.literal('TEXT'),
    textContent: textContentField,
    ...baseFields,
  }),
  z.object({
    contentType: z.literal('IMAGE'),
    fileUrl: fileUrlField,
    ...baseFields,
  }),
  z.object({
    contentType: z.literal('FILE'),
    fileUrl: fileUrlField,
    ...baseFields,
  }),
  z.object({
    contentType: z.literal('LINK'),
    linkUrl: linkUrlField,
    ...baseFields,
  }),
])

// Update: semua field optional. Kita tidak pakai discriminated union supaya
// user bisa edit sebagian (mis. cuma title) tanpa kirim ulang contentType.
export const knowledgeUpdateSchema = z.object({
  title: titleField.optional(),
  textContent: z
    .string()
    .trim()
    .max(2000, 'Isi maksimal 2000 karakter')
    .optional()
    .nullable(),
  fileUrl: z
    .string()
    .trim()
    .max(500)
    .regex(KNOWLEDGE_FILE_URL, FILE_URL_INVALID)
    .optional()
    .nullable(),
  linkUrl: z
    .string()
    .trim()
    .url('URL tidak valid')
    .max(500)
    .optional()
    .nullable(),
  caption: captionField,
  triggerKeywords: keywordsField.optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
})

export type KnowledgeCreateInput = z.infer<typeof knowledgeCreateSchema>
export type KnowledgeUpdateInput = z.infer<typeof knowledgeUpdateSchema>

// Untuk endpoint suggest-keywords — AI akan generate kata kunci berdasarkan
// judul + isi/caption. Kirim contentType supaya prompt AI bisa lebih relevan.
export const suggestKeywordsSchema = z.object({
  title: titleField,
  contentType: z.enum(KNOWLEDGE_TYPES),
  textContent: z.string().trim().max(2000).optional().nullable(),
  caption: z.string().trim().max(1000).optional().nullable(),
  existingKeywords: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .optional(),
})
export type SuggestKeywordsInput = z.infer<typeof suggestKeywordsSchema>
