// Handler webhook template (App-level — Meta tidak mengizinkan override per
// WABA): message_template_status_update, message_template_quality_update,
// template_category_update. Lookup by metaTemplateId → fallback
// (wabaId, name, language). Template tak dikenal → sync penuh WABA itu
// (template dibuat di luar hulao).

import { prisma } from '@/lib/prisma'

import { mapMetaCategory, mapMetaStatus, syncTemplatesFromMeta } from './templates-sync'
import type {
  WabaTemplateCategoryValue,
  WabaTemplateQualityValue,
  WabaTemplateStatusValue,
} from './types'

async function findTemplate(
  wabaId: string,
  v: { message_template_id?: number | string; message_template_name?: string; message_template_language?: string },
) {
  const metaId = v.message_template_id !== undefined ? String(v.message_template_id) : null
  if (metaId) {
    const byId = await prisma.wabaTemplate.findUnique({ where: { metaTemplateId: metaId } })
    if (byId) return byId
  }
  if (v.message_template_name && v.message_template_language) {
    return prisma.wabaTemplate.findUnique({
      where: {
        wabaId_name_language: {
          wabaId,
          name: v.message_template_name,
          language: v.message_template_language,
        },
      },
    })
  }
  return null
}

async function syncUnknown(wabaId: string, reason: string): Promise<void> {
  const owner = await prisma.whatsappSession.findFirst({
    where: { wabaId, provider: 'CLOUD_API', status: { not: 'DISCONNECTED' } },
    select: { userId: true },
    orderBy: { updatedAt: 'desc' },
  })
  if (!owner) {
    console.log(`[waba/template-webhooks] WABA ${wabaId} tidak dikenal (${reason}) — dilewati`)
    return
  }
  const r = await syncTemplatesFromMeta({ wabaId, userId: owner.userId })
  console.log(`[waba/template-webhooks] sync WABA ${wabaId} karena ${reason}:`, r)
}

export async function handleTemplateStatusUpdate(
  wabaId: string,
  value: WabaTemplateStatusValue,
): Promise<void> {
  const tpl = await findTemplate(wabaId, value)
  if (!tpl) {
    await syncUnknown(wabaId, `status ${value.event} template ${value.message_template_name ?? value.message_template_id}`)
    return
  }
  const event = (value.event ?? '').toUpperCase()
  if (event === 'FLAGGED') {
    console.warn(`[waba/template-webhooks] template ${tpl.name} FLAGGED: ${value.reason ?? value.other_info?.description ?? ''}`)
    return
  }
  const status = mapMetaStatus(event)
  const now = new Date()
  const metaId = value.message_template_id !== undefined ? String(value.message_template_id) : null
  await prisma.wabaTemplate.update({
    where: { id: tpl.id },
    data: {
      status,
      ...(metaId && metaId !== tpl.metaTemplateId ? { metaTemplateId: metaId } : {}),
      ...(status === 'APPROVED' ? { approvedAt: tpl.approvedAt ?? now, rejectionReason: null } : {}),
      ...(status === 'REJECTED' ? { rejectionReason: value.reason ?? value.other_info?.description ?? 'Ditolak Meta' } : {}),
      ...(status === 'PAUSED' || status === 'DISABLED'
        ? { rejectionReason: value.other_info?.description ?? value.reason ?? tpl.rejectionReason }
        : {}),
      lastSyncedAt: now,
    },
  })
  console.log(`[waba/template-webhooks] ${tpl.name}/${tpl.language} → ${status}`)
}

export async function handleTemplateQualityUpdate(
  wabaId: string,
  value: WabaTemplateQualityValue,
): Promise<void> {
  const tpl = await findTemplate(wabaId, value)
  if (!tpl) {
    await syncUnknown(wabaId, `quality template ${value.message_template_name ?? value.message_template_id}`)
    return
  }
  await prisma.wabaTemplate.update({
    where: { id: tpl.id },
    data: { qualityScore: value.new_quality_score ?? tpl.qualityScore, lastSyncedAt: new Date() },
  })
}

export async function handleTemplateCategoryUpdate(
  wabaId: string,
  value: WabaTemplateCategoryValue,
): Promise<void> {
  const tpl = await findTemplate(wabaId, value)
  if (!tpl) {
    await syncUnknown(wabaId, `category template ${value.message_template_name ?? value.message_template_id}`)
    return
  }
  // Kategori menentukan HARGA charge berikutnya — wajib diikuti.
  const next = mapMetaCategory(value.new_category) ?? mapMetaCategory(value.correct_category)
  if (!next || next === tpl.category) return
  await prisma.wabaTemplate.update({
    where: { id: tpl.id },
    data: { category: next, lastSyncedAt: new Date() },
  })
  console.warn(`[waba/template-webhooks] kategori ${tpl.name} diubah Meta: ${tpl.category} → ${next} (harga ikut berubah)`)
}
