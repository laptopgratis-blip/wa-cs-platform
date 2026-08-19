// Helper untuk hitung target broadcast dan render variabel pesan.
// Variabel yang di-support: {nama}, {nomor}.
import type { PipelineStage } from '@prisma/client'

import { flattenParamValue, type TemplateSendParams } from '@/lib/services/waba/template-payload'

export function renderBroadcastMessage(
  template: string,
  contact: { name: string | null; phoneNumber: string },
): string {
  return template
    .replaceAll('{nama}', contact.name ?? 'Kak')
    .replaceAll('{nomor}', contact.phoneNumber)
}

// Build clause Prisma where untuk hitung/list target dari kombinasi tags+stages.
// Logika: tags OR stages — kontak match kalau punya tag manapun ATAU stage manapun.
// excludeMarketingOptOut: broadcast template MARKETING (Cloud API) wajib
// melewati kontak yang memilih berhenti menerima promo (webhook user_preferences).
export function buildTargetWhere(input: {
  userId: string
  waSessionId: string
  tags: string[]
  stages: PipelineStage[]
  excludeMarketingOptOut?: boolean
}): Record<string, unknown> {
  const or: Record<string, unknown>[] = []
  if (input.tags.length > 0) or.push({ tags: { hasSome: input.tags } })
  if (input.stages.length > 0) or.push({ pipelineStage: { in: input.stages } })

  const where: Record<string, unknown> = {
    userId: input.userId,
    waSessionId: input.waSessionId,
    isBlacklisted: false,
  }
  if (input.excludeMarketingOptOut) where.marketingOptOut = false
  if (or.length > 0) where.OR = or
  return where
}

/**
 * Render parameter template per penerima: nilai boleh memuat {nama}/{nomor},
 * lalu di-flatten (Meta menolak newline/tab di parameter).
 */
export function renderRecipientParams(
  params: TemplateSendParams,
  contact: { name: string | null; phoneNumber: string },
): TemplateSendParams {
  const r = (v: string) => flattenParamValue(renderBroadcastMessage(v, contact))
  return {
    ...(params.header
      ? { header: { ...params.header, value: params.header.type === 'text' ? r(params.header.value) : params.header.value } }
      : {}),
    body: (params.body ?? []).map(r),
    ...(params.buttons ? { buttons: params.buttons.map((b) => ({ ...b, value: r(b.value) })) } : {}),
  }
}
