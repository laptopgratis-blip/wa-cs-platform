// Schema validasi untuk broadcast.
// Baileys: `message` free-text wajib. Cloud API (Trek 2B): `templateId`
// (APPROVED) + `templateParams`; `message` opsional (diisi server = render).
//
// Target: `targetAll` = semua kontak di nomor pengirim (disimpan sebagai
// targetTags & targetStages KOSONG — buildTargetWhere tanpa filter OR).
// Broadcast lama selalu punya ≥1 tag/stage, jadi target kosong tidak ambigu.
import { z } from 'zod'

import { templateSendParamsSchema } from '@/lib/validations/waba-template'

export const broadcastCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama broadcast minimal 2 karakter').max(80),
    waSessionId: z.string().min(1, 'Pilih akun WhatsApp'),
    message: z.string().trim().max(4000).optional().default(''),
    templateId: z.string().trim().min(1).nullable().optional(),
    templateParams: templateSendParamsSchema.nullable().optional(),
    targetAll: z.boolean().optional().default(false),
    targetTags: z.array(z.string()).max(20).default([]),
    targetStages: z
      .array(
        z.enum([
          'NEW',
          'PROSPECT',
          'INTEREST',
          'NEGOTIATION',
          'CLOSED_WON',
          'CLOSED_LOST',
        ]),
      )
      .max(6)
      .default([]),
    scheduledAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
  })
  .refine(
    (v) => v.targetAll || v.targetTags.length > 0 || v.targetStages.length > 0,
    {
      message: 'Pilih target: semua kontak di nomor ini, atau minimal satu tag/stage',
      path: ['targetTags'],
    },
  )
  .refine((v) => Boolean(v.templateId) || v.message.trim().length > 0, {
    message: 'Pesan tidak boleh kosong',
    path: ['message'],
  })
  // targetAll menang atas pilihan tag/stage — simpan target kosong.
  .transform((v) => (v.targetAll ? { ...v, targetTags: [], targetStages: [] } : v))

export type BroadcastCreateInput = z.infer<typeof broadcastCreateSchema>
