// Schema validasi untuk broadcast.
import { z } from 'zod'

export const broadcastCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama broadcast minimal 2 karakter').max(80),
    waSessionId: z.string().min(1, 'Pilih akun WhatsApp'),
    message: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(4000),
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
    (v) => v.targetTags.length > 0 || v.targetStages.length > 0,
    { message: 'Pilih minimal satu tag atau stage', path: ['targetTags'] },
  )

export type BroadcastCreateInput = z.infer<typeof broadcastCreateSchema>
