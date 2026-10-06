// Kirim satu item FollowUpQueue — provider-aware via smartSend:
//   Baileys → free-text; Cloud API dalam window → free-text; di luar window →
//   template Meta (metaTemplateId) dengan resolvedParams. Template tertaut
//   milik WABA lama (seller ganti nomor) → smartSend mencari padanan di WABA
//   aktif (`fallbackFromLinked`), gagal → alasan actionable + flag permanen.
// Dipakai cron followup-send, send-now, dan test-send. NEVER throw.
//
// Catatan: fungsi ini TIDAK mengubah status queue (PENDING/SENT/FAILED) —
// itu tanggung jawab pemanggil (cron melakukan claim atomik dulu). Fungsi ini
// hanya mengisi jejak pengiriman (waSessionId/sentVia/externalMsgId) saat sukses.

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { listSenderCandidates } from '@/lib/wa-session'
import {
  smartSend,
  type SmartSendResult,
  type SmartSendTemplateSpec,
} from '@/lib/services/wa-send/smart-send'
import {
  resolveLeadTemplateParams,
  resolveTemplateParams,
} from '@/lib/services/followup-variables'
import {
  emptyParamPlaceholders,
  missingDataReason,
} from '@/lib/services/followup-failure-policy'

/** Include wajib saat memuat FollowUpQueue untuk dikirim (cron & send-now). */
export const FOLLOWUP_SEND_INCLUDE = {
  order: true,
  template: {
    include: {
      metaTemplate: {
        select: {
          id: true,
          wabaId: true,
          status: true,
          purposeKey: true,
          name: true,
          language: true,
          category: true,
          bodyText: true,
        },
      },
    },
  },
} as const satisfies Prisma.FollowUpQueueInclude

export type QueueItemForSend = Prisma.FollowUpQueueGetPayload<{
  include: typeof FOLLOWUP_SEND_INCLUDE
}>

const UNLINKED_WINDOW_CLOSED =
  'Window 24 jam customer sudah tutup dan follow-up ini belum ditautkan ke Template Meta — ' +
  'pilih Template Meta di pengaturan follow-up supaya tetap terkirim di luar window'
const PARAMS_UNRESOLVED =
  'Variabel Template Meta follow-up ini belum bisa diisi (peta variabel kosong/tidak lengkap) — ' +
  'pilih ulang Template Meta di pengaturan follow-up'

/** Cache resolvedParams masih sah bila panjangnya sama dengan peta saat ini. */
function cachedParams(item: QueueItemForSend, paramMap: string[] | null): string[] | null {
  if (!Array.isArray(item.resolvedParams)) return null
  const cached = item.resolvedParams as string[]
  if (paramMap && cached.length !== paramMap.length) return null
  return cached
}

/**
 * Pastikan parameter template tersedia. Dipakai saat metaTemplateId ada tapi
 * resolvedParams belum dihitung (template Meta di-link setelah queue dibuat).
 */
export async function ensureResolvedParams(item: QueueItemForSend): Promise<string[] | null> {
  const tpl = item.template
  const paramMap = paramMapOf(item)
  // Peta berubah setelah queue dibuat (re-link / edit) → hitung ulang.
  const cached = cachedParams(item, paramMap)
  if (cached) return cached
  if (!tpl.metaTemplateId || !paramMap) return null

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

export interface FollowUpSendResult extends SmartSendResult {
  /**
   * Placeholder peta variabel yang datanya kosong untuk item ini (mis.
   * `{resi}`) saat payload/Meta menolak jumlah parameter — masalah satu
   * pesanan, bukan template rusak.
   */
  missingData?: string[]
}

export async function sendQueueItem(
  item: QueueItemForSend,
  // Konteks pemanggil (cron vs manual) — disimpan di signature untuk logging
  // future; belum dipakai.
  opts: { source: 'AUTOMATIC' | 'MANUAL' },
): Promise<FollowUpSendResult> {
  void opts
  try {
    return await sendQueueItemInner(item)
  } catch (err) {
    // NEVER throw — cron sudah claim PENDING→SENT sebelum memanggil; throw di
    // sini membuat status SENT palsu permanen tanpa pesan terkirim.
    console.error('[followup-sender] sendQueueItem gagal:', err)
    return {
      success: false,
      code: 'META_ERROR',
      error: `Gagal kirim follow-up: ${(err as Error).message}`,
      attempts: [],
    }
  }
}

async function sendQueueItemInner(item: QueueItemForSend): Promise<FollowUpSendResult> {
  const candidates = await listSenderCandidates({
    userId: item.userId,
    preferContactPhone: item.customerPhone,
  })

  // Template Cloud API bila FollowUpTemplate sudah di-link ke WabaTemplate.
  let template: SmartSendTemplateSpec | undefined
  const metaTemplateId = item.template.metaTemplateId
  const params = metaTemplateId ? await ensureResolvedParams(item) : null
  if (metaTemplateId && params) {
    template = { templateId: metaTemplateId, params: { body: params }, fallbackFromLinked: true }
  }

  const result = await smartSend({
    candidates,
    to: item.customerPhone,
    text: item.resolvedMessage,
    template,
    purpose: 'FOLLOWUP',
    source: 'FOLLOWUP',
  })

  if (!result.success) {
    const explained = withActionableDetail(result, metaTemplateId, Boolean(template))
    return withMissingData(explained, paramMapOf(item), params)
  }

  if (result.sessionId) {
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

function paramMapOf(item: QueueItemForSend): string[] | null {
  const map = item.template.metaParamMap
  return Array.isArray(map) ? (map as string[]) : null
}

/**
 * Template ditolak karena jumlah parameter, dan ada variabel yang datanya
 * kosong untuk item ini → tandai `missingData` + alasan yang menunjuk data
 * pesanan (bukan template). Mengembalikan objek baru.
 */
function withMissingData(
  result: SmartSendResult,
  paramMap: string[] | null,
  params: string[] | null,
): FollowUpSendResult {
  if (result.code !== 'NO_TEMPLATE' || !params) return result
  const paramRejected = result.attempts.some((a) => a.code === 'TEMPLATE_PARAM_MISMATCH')
  if (!paramRejected) return result
  const missing = emptyParamPlaceholders(paramMap, params)
  if (missing.length === 0) return result
  return { ...result, missingData: missing, detail: missingDataReason(missing) }
}

/**
 * Window tutup tanpa template → jelaskan ke seller apa yang harus dilakukan
 * (bukan sekadar "tidak ada template"). Mengembalikan objek baru.
 */
function withActionableDetail(
  result: SmartSendResult,
  metaTemplateId: string | null,
  hasTemplate: boolean,
): SmartSendResult {
  if (result.code !== 'WINDOW_CLOSED' || hasTemplate) return result
  return { ...result, detail: metaTemplateId ? PARAMS_UNRESOLVED : UNLINKED_WINDOW_CLOSED }
}
