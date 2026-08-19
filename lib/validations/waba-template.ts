// Validasi schema template Meta (Trek 2B). Aturan bisnis detail ada di
// lib/services/waba/template-validate.ts (pure) — schema ini memastikan
// bentuk payload + memanggil validator itu lewat superRefine.
import { z } from 'zod'

import { validateTemplateDraft } from '@/lib/services/waba/template-validate'

const buttonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('QUICK_REPLY'), text: z.string().trim().min(1).max(25) }),
  z.object({
    type: z.literal('URL'),
    text: z.string().trim().min(1).max(25),
    url: z.string().trim().min(1).max(2000),
    example: z.string().trim().max(500).optional(),
  }),
  z.object({
    type: z.literal('PHONE_NUMBER'),
    text: z.string().trim().min(1).max(25),
    phone_number: z.string().trim().min(7).max(20),
  }),
  z.object({ type: z.literal('COPY_CODE'), example: z.string().trim().min(1).max(15) }),
  z.object({
    type: z.literal('OTP'),
    otp_type: z.literal('COPY_CODE'),
    text: z.string().trim().max(25).optional(),
  }),
])

export const templateDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(512),
    language: z.string().trim().min(2).max(10),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
    headerType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).nullable().optional(),
    headerText: z.string().trim().max(60).nullable().optional(),
    headerTextExample: z.string().trim().max(60).nullable().optional(),
    headerMediaHandle: z.string().trim().max(2000).nullable().optional(),
    headerMediaUrl: z.string().trim().max(2000).nullable().optional(),
    bodyText: z.string().max(1024).default(''),
    bodyExamples: z.array(z.string().max(500)).max(30).default([]),
    footerText: z.string().trim().max(60).nullable().optional(),
    buttons: z.array(buttonSchema).max(10).nullable().optional(),
    authAddSecurityRecommendation: z.boolean().nullable().optional(),
    authCodeExpirationMinutes: z.number().int().min(1).max(90).nullable().optional(),
  })
  .superRefine((draft, ctx) => {
    const v = validateTemplateDraft(draft)
    for (const e of v.errors) ctx.addIssue({ code: 'custom', message: e })
  })

export type TemplateDraftPayload = z.infer<typeof templateDraftSchema>

export const templateSendParamsSchema = z.object({
  header: z
    .object({
      type: z.enum(['text', 'image', 'video', 'document']),
      value: z.string().trim().min(1).max(2000),
      filename: z.string().trim().max(200).optional(),
    })
    .optional(),
  body: z.array(z.string().max(1024)).max(30).default([]),
  buttons: z
    .array(
      z.object({
        index: z.number().int().min(0).max(9),
        subType: z.enum(['url', 'copy_code', 'quick_reply']),
        value: z.string().trim().min(1).max(500),
      }),
    )
    .max(10)
    .optional(),
})

export type TemplateSendParamsPayload = z.infer<typeof templateSendParamsSchema>

export const createTemplateBodySchema = z.object({
  sessionId: z.string().trim().min(1),
  draft: templateDraftSchema,
})

export const updateTemplateBodySchema = z.object({
  draft: templateDraftSchema,
})

export const templateTestSendSchema = z.object({
  to: z.string().trim().min(8).max(20),
  params: templateSendParamsSchema.default({ body: [] }),
})

export const templateSyncSchema = z.object({
  sessionId: z.string().trim().min(1),
})

export const starterPackSchema = z.object({
  sessionId: z.string().trim().min(1),
  keys: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
})
