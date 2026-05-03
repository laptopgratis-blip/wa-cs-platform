// Schema validasi update kontak.
import { z } from 'zod'

export const pipelineEnum = z.enum([
  'NEW',
  'PROSPECT',
  'INTEREST',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
])

export const contactUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  notes: z.string().max(4000).nullable().optional(),
  pipelineStage: pipelineEnum.optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(30).optional(),
  isBlacklisted: z.boolean().optional(),
})

export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>

export const PIPELINE_LABELS: Record<z.infer<typeof pipelineEnum>, string> = {
  NEW: 'Baru',
  PROSPECT: 'Prospek',
  INTEREST: 'Tertarik',
  NEGOTIATION: 'Negosiasi',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
}
