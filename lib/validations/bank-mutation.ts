// Validasi untuk fitur Bank Mutation Auto-Reader (Phase 1, 2026-05-08).
// User input KlikBCA Individual User ID + PIN. Disimpan encrypted di DB,
// dipakai di scraper service untuk login otomatis.
import { z } from 'zod'

// User ID KlikBCA biasanya 6-30 karakter alfanumerik. Tidak strict supaya
// user pakai kombinasi yang berlaku (hanya BCA yang authoritative).
export const bankMutationSetupSchema = z.object({
  bcaUserId: z
    .string()
    .trim()
    .min(4, 'User ID minimal 4 karakter')
    .max(40, 'User ID maksimal 40 karakter'),
  bcaPin: z
    .string()
    .min(4, 'PIN minimal 4 karakter')
    .max(40, 'PIN maksimal 40 karakter'),
  isBetaConsented: z
    .boolean()
    .refine((v) => v === true, {
      message: 'Wajib menyetujui disclaimer beta sebelum aktivasi.',
    }),
})

export const bankMutationSettingsSchema = z.object({
  autoConfirmEnabled: z.boolean().optional(),
  matchByExactAmount: z.boolean().optional(),
  matchByCustomerName: z.boolean().optional(),
  scrapeIntervalMinutes: z.number().int().min(15).max(180).optional(),
  isActive: z.boolean().optional(),
})

export const manualMatchSchema = z.object({
  // Order yang user pilih untuk di-confirm. Atau null = mark IGNORED.
  orderId: z.string().nullable(),
})

export type BankMutationSetupInput = z.infer<typeof bankMutationSetupSchema>
export type BankMutationSettingsInput = z.infer<
  typeof bankMutationSettingsSchema
>
