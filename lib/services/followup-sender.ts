// Kirim satu item FollowUpQueue — provider-aware via smartSend:
//   Baileys → free-text; Cloud API dalam window → free-text; di luar window →
//   template Meta (metaTemplateId) dengan resolvedParams.
// Dipakai cron followup-send, send-now, dan test-send. NEVER throw.
//
// Catatan: fungsi ini TIDAK mengubah status queue (PENDING/SENT/FAILED) —
// itu tanggung jawab pemanggil (cron melakukan claim atomik dulu). Fungsi ini
// hanya mengisi jejak pengiriman (waSessionId/sentVia/externalMsgId) saat sukses.

import type { FollowUpQueue, FollowUpTemplate } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { listSenderCandidates } from '@/lib/wa-session'
import { smartSend, type SmartSendResult } from '@/lib/services/wa-send/smart-send'
import {
  resolveLeadTemplateParams,
  resolveTemplateParams,
} from '@/lib/services/followup-variables'
import type { TemplateSendParams } from '@/lib/services/waba/template-payload'

export interface QueueItemForSend extends FollowUpQueue {
  template: FollowUpTemplate | null
}

/**
 * Pastikan parameter template tersedia. Dipakai saat metaTemplateId ada tapi
 * resolvedParams belum dihitung (template Meta di-link setelah queue dibuat).
 */
export async function ensureResolvedParams(item: QueueItemForSend): Promise<string[] | null> {
  if (Array.isArray(item.resolvedParams)) return item.resolvedParams as string[]
  const tpl = item.template
  if (!tpl?.metaTemplateId || !Array.isArray(tpl.metaParamMap)) return null
  const paramMap = tpl.metaParamMap as string[]

  try {
    if (item.orderId) {
      const order = await prisma.userOrder.findUnique({
        where: { id: item.orderId },
        include: { user: { select: { id: true, name: true } } },
      })
      if (!order) return null
      const [bankAccounts, shippingProfile] = await Promise.all([
        prisma.userBankAccount.findMany({ where: { userId: order.userId, isActive: true } }),
        prisma.userShippingProfile.findUnique({ where: { userId: order.userId } }),
      ])
      return resolveTemplateParams(paramMap, { order, user: order.user, bankAccounts, shippingProfile })
    }
    if (item.liveLeadId) {
      const lead = await prisma.liveLead.findUnique({
        where: { id: item.liveLeadId },
        include: { user: { select: { name: true } }, liveRoom: { select: { slug: true, orderFormSlug: true } } },
      })
      if (!lead) return null
      const orderLink = lead.liveRoom.orderFormSlug
        ? `https://hulao.id/order/${encodeURIComponent(lead.liveRoom.orderFormSlug)}`
        : `https://hulao.id/live/${encodeURIComponent(lead.liveRoom.slug)}`
      return resolveLeadTemplateParams(paramMap, {
        customerName: lead.customerName,
        productInterest: lead.productInterest,
        storeName: lead.user.name,
        orderLink,
      })
    }
  } catch (err) {
    console.error('[followup-sender] ensureResolvedParams gagal:', err)
  }
  return null
}

export async function sendQueueItem(
  item: QueueItemForSend,
  _opts: { source: 'AUTOMATIC' | 'MANUAL' },
): Promise<SmartSendResult> {
  const candidates = await listSenderCandidates({
    userId: item.userId,
    preferContactPhone: item.customerPhone,
  })

  // Template Cloud API bila FollowUpTemplate sudah di-link ke WabaTemplate.
  let template: { templateId: string; params: TemplateSendParams } | undefined
  if (item.template?.metaTemplateId) {
    const params = await ensureResolvedParams(item)
    if (params) {
      template = { templateId: item.template.metaTemplateId, params: { body: params } }
    }
  }

  const result = await smartSend({
    candidates,
    to: item.customerPhone,
    text: item.resolvedMessage,
    template,
    purpose: 'FOLLOWUP',
    source: 'FOLLOWUP',
  })

  if (result.success && result.sessionId) {
    await prisma.followUpQueue
      .update({
        where: { id: item.id },
        data: {
          waSessionId: result.sessionId,
          sentVia: result.via ?? null,
          externalMsgId: result.messageId ?? null,
        },
      })
      .catch(() => undefined)
  }
  return result
}
