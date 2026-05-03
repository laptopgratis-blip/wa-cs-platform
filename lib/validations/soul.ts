// Zod schema untuk Soul (create + update) dan untuk konfigurasi WA session.
import { z } from 'zod'

export const personalityEnum = z.enum(['RAMAH', 'PROFESIONAL', 'SANTAI', 'TEGAS'])
export const languageEnum = z.enum(['id', 'en', 'mix'])
export const replyStyleEnum = z.enum(['SINGKAT', 'DETAIL', 'EMOJI'])

export const soulCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama soul minimal 2 karakter').max(80),
  personality: personalityEnum.optional().nullable(),
  language: languageEnum,
  replyStyle: replyStyleEnum.optional().nullable(),
  businessContext: z.string().max(8000, 'Konteks bisnis maksimal 8000 karakter').optional().nullable(),
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
