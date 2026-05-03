// Schema validasi untuk endpoint admin.
import { z } from 'zod'

export const aiModelCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  provider: z.enum(['ANTHROPIC', 'OPENAI', 'GOOGLE']),
  modelId: z.string().trim().min(2).max(120),
  costPerMessage: z.number().int().positive().max(1000),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
})
export const aiModelUpdateSchema = aiModelCreateSchema.partial()
export type AiModelCreateInput = z.infer<typeof aiModelCreateSchema>

export const tokenPackageCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tokenAmount: z.number().int().positive().max(10_000_000),
  price: z.number().int().positive().max(100_000_000),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
})
export const tokenPackageUpdateSchema = tokenPackageCreateSchema.partial()
export type TokenPackageCreateInput = z.infer<typeof tokenPackageCreateSchema>

export const userTopupSchema = z.object({
  amount: z.number().int().positive().max(10_000_000),
  description: z.string().max(200).optional(),
})

export const bankAccountCreateSchema = z.object({
  bankName: z.string().trim().min(2, 'Nama bank minimal 2 karakter').max(60),
  accountNumber: z
    .string()
    .trim()
    .min(5, 'Nomor rekening minimal 5 karakter')
    .max(40),
  accountName: z.string().trim().min(2, 'Nama pemilik minimal 2 karakter').max(80),
  isActive: z.boolean().optional(),
})
export const bankAccountUpdateSchema = bankAccountCreateSchema.partial()
export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>

export const manualPaymentRejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Alasan penolakan minimal 3 karakter')
    .max(500, 'Alasan maksimal 500 karakter'),
})
export type ManualPaymentRejectInput = z.infer<typeof manualPaymentRejectSchema>
