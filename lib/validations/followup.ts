// Validasi schema untuk Follow-Up Order System (2026-05-08).
import { z } from 'zod'

const TRIGGER_VALUES = [
  'ORDER_CREATED',
  'PAYMENT_PAID',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'DAYS_AFTER_ORDER',
  'DAYS_AFTER_PAID',
  'DAYS_AFTER_SHIPPED',
] as const

const PAYMENT_STATUS_VALUES = [
  'PENDING',
  'WAITING_CONFIRMATION',
  'PAID',
  'CANCELLED',
] as const

const DELIVERY_STATUS_VALUES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const

const optionalString = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v === '' ? null : v))

export const followupTemplateCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  trigger: z.enum(TRIGGER_VALUES),
  paymentMethod: z
    .enum(['COD', 'TRANSFER'])
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  applyOnPaymentStatus: z
    .enum(PAYMENT_STATUS_VALUES)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  applyOnDeliveryStatus: z
    .enum(DELIVERY_STATUS_VALUES)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  delayDays: z.number().int().min(0).max(30).default(0),
  message: z.string().trim().min(1).max(4096),
  isActive: z.boolean().default(true),
  scope: z.enum(['GLOBAL', 'FORM']).default('GLOBAL'),
  orderFormId: optionalString,
  order: z.number().int().min(0).max(9999).default(0),
})

export const followupTemplateUpdateSchema = followupTemplateCreateSchema
  .partial()
  .strict()

export const followupQueueEditSchema = z.object({
  resolvedMessage: z.string().trim().min(1).max(4096),
})

export const followupManualSendSchema = z
  .object({
    message: z.string().trim().min(1).max(4096).optional(),
    templateId: z.string().min(1).optional(),
  })
  .refine((d) => d.message || d.templateId, {
    message: 'Either message or templateId is required',
  })

export type FollowupTemplateCreateInput = z.infer<
  typeof followupTemplateCreateSchema
>
export type FollowupTemplateUpdateInput = z.infer<
  typeof followupTemplateUpdateSchema
>
