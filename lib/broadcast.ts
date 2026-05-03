// Helper untuk hitung target broadcast dan render variabel pesan.
// Variabel yang di-support: {nama}, {nomor}.

export function renderBroadcastMessage(
  template: string,
  contact: { name: string | null; phoneNumber: string },
): string {
  return template
    .replaceAll('{nama}', contact.name ?? 'Kak')
    .replaceAll('{nomor}', contact.phoneNumber)
}

import type { PipelineStage } from '@prisma/client'

// Build clause Prisma where untuk hitung/list target dari kombinasi tags+stages.
// Logika: tags OR stages — kontak match kalau punya tag manapun ATAU stage manapun.
export function buildTargetWhere(input: {
  userId: string
  waSessionId: string
  tags: string[]
  stages: PipelineStage[]
}): Record<string, unknown> {
  const or: Record<string, unknown>[] = []
  if (input.tags.length > 0) or.push({ tags: { hasSome: input.tags } })
  if (input.stages.length > 0) or.push({ pipelineStage: { in: input.stages } })

  const where: Record<string, unknown> = {
    userId: input.userId,
    waSessionId: input.waSessionId,
    isBlacklisted: false,
  }
  if (or.length > 0) where.OR = or
  return where
}
