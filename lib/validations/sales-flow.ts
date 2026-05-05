// Zod schema untuk UserSalesFlow.
import { z } from 'zod'

export const SALES_FLOW_TEMPLATES_KEYS = [
  'COD',
  'TRANSFER',
  'BOOKING',
  'CONSULTATION',
  'CUSTOM',
] as const

export const SALES_FLOW_LIMIT_PER_USER = 5

const validationField = z
  .union([
    z.literal('min_words:2'),
    z.literal('min_words:3'),
    z.literal('phone'),
    z.literal('address'),
    z.literal('yes_no'),
    z.null(),
  ])
  .nullable()

export const salesFlowStepSchema = z.object({
  fieldName: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9]*$/,
      'fieldName harus huruf+angka tanpa spasi (camelCase)',
    )
    .min(2)
    .max(40),
  question: z.string().trim().min(2, 'Pertanyaan minimal 2 karakter').max(800),
  validation: validationField,
})

export const salesFlowFinalActionSchema = z.object({
  notifyAdmin: z.boolean(),
  // E.164 atau format lokal — disanitasi di flow-engine sebelum dipakai.
  adminPhone: z.string().trim().max(20).default(''),
  replyMessage: z
    .string()
    .trim()
    .min(2, 'Pesan balasan minimal 2 karakter')
    .max(1000),
  bankInfo: z
    .object({
      bankName: z.string().trim().max(40).default(''),
      accountNumber: z.string().trim().max(40).default(''),
      accountName: z.string().trim().max(80).default(''),
    })
    .optional()
    .nullable(),
})

const baseFields = {
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  description: z.string().trim().max(300).optional().nullable(),
  triggerKeywords: z
    .array(z.string().trim().min(2).max(40))
    .max(20)
    .default([]),
  steps: z.array(salesFlowStepSchema).max(10, 'Maksimal 10 pertanyaan'),
  finalAction: salesFlowFinalActionSchema,
  isActive: z.boolean().optional(),
}

export const salesFlowCreateSchema = z.object({
  template: z.enum(SALES_FLOW_TEMPLATES_KEYS),
  ...baseFields,
})

export const salesFlowUpdateSchema = z.object({
  name: baseFields.name.optional(),
  description: baseFields.description,
  triggerKeywords: baseFields.triggerKeywords.optional(),
  steps: baseFields.steps.optional(),
  finalAction: baseFields.finalAction.optional(),
  isActive: z.boolean().optional(),
})

export type SalesFlowCreateInput = z.infer<typeof salesFlowCreateSchema>
export type SalesFlowUpdateInput = z.infer<typeof salesFlowUpdateSchema>
export type SalesFlowStepInput = z.infer<typeof salesFlowStepSchema>
export type SalesFlowFinalActionInput = z.infer<
  typeof salesFlowFinalActionSchema
>
