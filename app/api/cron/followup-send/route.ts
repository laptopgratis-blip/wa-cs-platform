// POST or GET /api/cron/followup-send
//
// Worker untuk Follow-Up Order System — pick FollowUpQueue PENDING yang due
// (scheduledAt <= now), validate ulang kondisi, kirim ke customer via WA, log.
// At-most-once: tiap row di-claim atomik (PENDING → SENT) SEBELUM kirim,
// supaya dua trigger cron yang overlap tidak mengirim WA dobel.
//
// Setup eksternal: cron-job.org, hit:
//   https://hulao.id/api/cron/followup-send?secret=<CRON_SECRET>
// Frequency: tiap 5 menit. Batch 50 per run untuk avoid spam burst.
//
// Auth: terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'
import {
  HANDOFF_CLAIM_STALE_MS,
  HANDOFF_RETRY_CLAIM,
  retryLeadHandoff,
} from '@/lib/services/live/handoff'
import { notifyEbookAccess } from '@/lib/services/ebook/access-notif'
import { notifyNewOrder } from '@/lib/services/order-notif'
import { notifyFollowUpFailure } from '@/lib/services/followup-alert'
import {
  decideFollowUpFailure,
  type FollowUpFailureScope,
} from '@/lib/services/followup-failure-policy'
import {
  FOLLOWUP_SEND_INCLUDE,
  sendQueueItem,
  type QueueItemForSend,
} from '@/lib/services/followup-sender'

const BATCH_SIZE = 50

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const now = new Date()

  const due = await prisma.followUpQueue.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    include: FOLLOWUP_SEND_INCLUDE,
    take: BATCH_SIZE,
    orderBy: { scheduledAt: 'asc' },
  })

  let sent = 0
  let failed = 0
  let skipped = 0
  let retried = 0

  for (const item of due) {
    try {
      // ── Item nurture lead Live "belum order" ──────────────────────────
      // Auto-stop: kalau customer sudah bikin UserOrder, hentikan nurture.
      if (item.liveLeadId && !item.orderId) {
        const phoneNoPlus = item.customerPhone.replace(/^\+/, '')
        const converted = await prisma.userOrder.findFirst({
          where: {
            userId: item.userId,
            customerPhone: { in: [phoneNoPlus, `+${phoneNoPlus}`] },
          },
          select: { id: true },
        })
        if (converted) {
          await markSkipped(item.id, 'Customer sudah order — nurture dihentikan')
          skipped++
          continue
        }
      }

      // ── Validasi khusus item berbasis order (di-skip untuk item lead) ──
      if (item.order) {
        // Order CANCELLED → skip (kecuali template-nya emang untuk CANCELLED).
        if (
          item.order.paymentStatus === 'CANCELLED' &&
          item.template.trigger !== 'CANCELLED'
        ) {
          await markSkipped(item.id, 'Order cancelled')
          skipped++
          continue
        }

        // Re-validate status — mungkin status berubah sejak queue di-create.
        // Misal template "Reminder Hari 1 - Belum Bayar" applyOnPaymentStatus=
        // PENDING; kalau saat send sudah PAID, skip.
        if (
          item.template.applyOnPaymentStatus &&
          item.template.applyOnPaymentStatus !== item.order.paymentStatus
        ) {
          await markSkipped(
            item.id,
            `Payment status berubah jadi ${item.order.paymentStatus}`,
          )
          skipped++
          continue
        }
        if (
          item.template.applyOnDeliveryStatus &&
          item.template.applyOnDeliveryStatus !== item.order.deliveryStatus
        ) {
          await markSkipped(
            item.id,
            `Delivery status berubah jadi ${item.order.deliveryStatus}`,
          )
          skipped++
          continue
        }
      }

      // Customer di blacklist (mungkin baru di-block setelah queue dibuat).
      const blacklisted = await prisma.followUpBlacklist.findUnique({
        where: {
          userId_customerPhone: {
            userId: item.userId,
            customerPhone: item.customerPhone,
          },
        },
      })
      if (blacklisted) {
        await markSkipped(item.id, 'Customer in blacklist')
        skipped++
        continue
      }

      // Claim atomik SEBELUM kirim (at-most-once): PENDING → SENT hanya kalau
      // status masih PENDING. Dua trigger cron yang overlap tidak akan
      // mengirim WA dobel ke customer — yang kalah claim (count 0) skip.
      // Status enum FollowUpQueue tidak punya state "SENDING", jadi claim
      // langsung ke SENT; kalau pengiriman ternyata gagal, di bawah
      // dikembalikan ke PENDING (retry) atau FAILED.
      const claim = await prisma.followUpQueue.updateMany({
        where: { id: item.id, status: 'PENDING' },
        data: { status: 'SENT', sentAt: new Date() },
      })
      if (claim.count === 0) {
        // Sudah di-claim/diproses run lain — jangan kirim dobel.
        skipped++
        continue
      }

      // Kirim via smartSend (provider-aware): Baileys free-text, Cloud API
      // dalam window free-text, di luar window → template Meta ter-approve.
      // NEVER throw — hasil {success, code, error}.
      const send = await sendQueueItem(item, { source: 'AUTOMATIC' })

      if (send.success) {
        // Status & sentAt sudah di-set saat claim di atas.
        await prisma.followUpLog.create({
          data: { ...logBase(item), status: 'SENT', source: 'AUTOMATIC' },
        })
        sent++
        continue
      }

      // Gagal: putuskan retry / final / skip (lib/services/followup-failure-policy).
      // Gagal permanen (template DRAFT, beda jumlah variabel, tak ada padanan
      // di WABA aktif) langsung FAILED + log + notifikasi — tidak lagi
      // diulang 12x lalu FAILED senyap.
      const decision = decideFollowUpFailure({
        code: send.code,
        permanent: send.permanent,
        detail: send.detail,
        error: send.error,
        missingData: send.missingData,
        retryCount: item.retryCount,
      })
      if (decision.action === 'SKIP') {
        await markSkipped(item.id, decision.reason)
        skipped++
      } else if (decision.action === 'FAIL_FINAL') {
        await failFinal(item, decision, send.error)
        failed++
      } else {
        // Kembalikan ke PENDING dengan backoff + alasan (claim sebelumnya SENT).
        await prisma.followUpQueue.update({
          where: { id: item.id },
          data: {
            status: 'PENDING',
            sentAt: null,
            retryCount: { increment: 1 },
            scheduledAt: new Date(Date.now() + decision.backoffMs),
            failedReason: decision.reason,
          },
        })
        retried++
      }
    } catch (err) {
      console.error('[followup-send] item error:', item.id, err)
      failed++
    }
  }

  // ── Auto-retry handoff LiveLead yang gagal (< 24 jam) ────────────────
  // Kasus riil 2026-07-16: WA owner sempat disconnect saat live → customer
  // klik "Order WA", lead tercatat HANDOFF_FAILED dan tidak pernah menerima
  // WA. Sapu di cron ini (sudah terjadwal rapat) supaya begitu WA owner
  // connect lagi, handoff terkirim otomatis. Klaim anti-dobel di
  // retryLeadHandoff (marker [retrying] + stale takeover).
  let handoffSent = 0
  let handoffFailed = 0
  const staleBefore = new Date(now.getTime() - HANDOFF_CLAIM_STALE_MS)
  const failedLeads = await prisma.liveLead.findMany({
    where: {
      status: 'HANDOFF_FAILED',
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      OR: [
        { NOT: { handoffError: HANDOFF_RETRY_CLAIM } },
        { handoffError: HANDOFF_RETRY_CLAIM, updatedAt: { lt: staleBefore } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })
  for (const l of failedLeads) {
    try {
      const result = await retryLeadHandoff(l.id)
      if (result === 'SENT') handoffSent++
      else if (result === 'FAILED') handoffFailed++
    } catch (err) {
      handoffFailed++
      console.error('[cron followup-send] retry handoff gagal', l.id, err)
    }
  }

  // ── Retry notif WA "Order Baru" ke owner (< 24 jam) ─────────────────
  // notifyNewOrder idempotent (klaim via ownerNotifiedAt) — di sini cukup
  // panggil ulang untuk order yang belum ter-stamp DAN ownernya memang
  // mengaktifkan WA konfirmasi.
  let ownerNotifRetried = 0
  const unnotified = await prisma.userOrder.findMany({
    where: {
      ownerNotifiedAt: null,
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      user: {
        shippingProfile: {
          waConfirmActive: true,
          waConfirmNumber: { not: null },
        },
      },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })
  for (const o of unnotified) {
    try {
      await notifyNewOrder(o.id)
      ownerNotifRetried++
    } catch (err) {
      console.error('[cron followup-send] retry notif owner gagal', o.id, err)
    }
  }

  // ── Sweep notif akses e-book yang belum terkirim (< 24 jam) ──────────
  // notifyEbookAccess idempotent (klaim via accessNotifiedAt, dilepas kalau
  // WA & email dua-duanya gagal) — panggil ulang untuk entitlement ACTIVE
  // yang notif aksesnya belum ter-stamp. Link e-book berbayar tidak boleh
  // hilang cuma karena WA admin pas putus saat PAID.
  let ebookNotifRetried = 0
  const unnotifiedEbooks = await prisma.ebookEntitlement.findMany({
    where: {
      accessNotifiedAt: null,
      status: 'ACTIVE',
      grantedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
    orderBy: { grantedAt: 'asc' },
    take: 50,
  })
  for (const e of unnotifiedEbooks) {
    try {
      await notifyEbookAccess(e.id)
      ebookNotifRetried++
    } catch (err) {
      console.error(
        '[cron followup-send] sweep notif e-book gagal',
        e.id,
        err,
      )
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      total: due.length,
      sent,
      failed,
      skipped,
      retried,
      handoffSent,
      handoffFailed,
      ownerNotifRetried,
      ebookNotifRetried,
    },
  })
}

async function markSkipped(queueId: string, reason: string) {
  await prisma.followUpQueue.update({
    where: { id: queueId },
    data: { status: 'SKIPPED', failedReason: reason },
  })
}

function logBase(item: QueueItemForSend) {
  return {
    userId: item.userId,
    orderId: item.orderId,
    liveLeadId: item.liveLeadId,
    templateId: item.templateId,
    queueId: item.id,
    customerPhone: item.customerPhone,
    message: item.resolvedMessage,
  }
}

/**
 * Gagal final: FAILED + FollowUpLog FAILED + notifikasi bell ke seller sesuai
 * lingkup penyebab (template / nomor / kredit / generik; CUSTOMER tanpa
 * notifikasi; dedupe 24 jam; never-throw). errorMessage log menyimpan
 * gabungan per-sesi untuk debug, failedReason menyimpan alasan ramah.
 */
async function failFinal(
  item: QueueItemForSend,
  decision: { reason: string; scope: FollowUpFailureScope },
  rawError?: string,
) {
  const { reason, scope } = decision
  await markFailed(item.id, reason)
  await prisma.followUpLog.create({
    data: {
      ...logBase(item),
      status: 'FAILED',
      errorMessage: rawError && rawError !== reason ? `${reason}\n\n${rawError}` : reason,
      source: 'AUTOMATIC',
    },
  })
  await notifyFollowUpFailure({
    userId: item.userId,
    followUpTemplateId: item.templateId,
    templateName: item.template.name,
    reason,
    scope,
  })
}

async function markFailed(queueId: string, reason: string) {
  // sentAt di-null-kan: row yang sempat di-claim SENT tapi gagal kirim
  // tidak boleh terlihat seolah sudah terkirim.
  await prisma.followUpQueue.update({
    where: { id: queueId },
    data: { status: 'FAILED', failedReason: reason, sentAt: null },
  })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
