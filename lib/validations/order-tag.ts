import { z } from 'zod'

// Limit jumlah tag per user supaya picker UI tidak meledak.
export const ORDER_TAG_LIMIT_PER_USER = 50

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

export const orderTagCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nama tag wajib diisi').max(40),
  color: z
    .string()
    .regex(HEX_COLOR, 'Format warna harus hex #RRGGBB')
    .optional()
    .default('#6B7280'),
})

export const orderTagUpdateSchema = orderTagCreateSchema.partial()

export type OrderTagCreateInput = z.infer<typeof orderTagCreateSchema>
export type OrderTagUpdateInput = z.infer<typeof orderTagUpdateSchema>
