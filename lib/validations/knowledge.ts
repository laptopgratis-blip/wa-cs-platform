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
const linkUrlField = z
  .string()
  .trim()
  .url('URL tidak valid')
  .max(500)
const fileUrlField = z
  .string()
  .trim()
  .min(1, 'File belum di-upload')
  .max(500)

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
  fileUrl: z.string().trim().max(500).optional().nullable(),
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
})
export type SuggestKeywordsInput = z.infer<typeof suggestKeywordsSchema>
