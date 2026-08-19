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
import { sendQueueItem } from '@/lib/services/followup-sender'

const BATCH_SIZE = 50
const MAX_SEND_RETRY = 3 // failure transmisi WA
// WA session tidak CONNECTED → tunda 30 menit per retry. 12× ≈ window 6 jam
// (dulu 5× ≈ 2,5 jam — kasus prod 2026-07-16: owner reconnect lebih lambat
// dari window, konfirmasi order customer ikut hangus).
const MAX_WA_RETRY = 12
const RETRY_BACKOFF_MS = 15 * 60 * 1000
const WA_RECONNECT_BACKOFF_MS = 30 * 60 * 1000

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const now = new Date()

  const due = await prisma.followUpQueue.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    include: { order: true, template: true },
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
      const sendResult = send.success
        ? { ok: true as const }
        : { ok: false as const, error: send.error ?? 'Gagal kirim', code: send.code }

      // Tidak ada sesi terhubung sama sekali → tunda (mungkin lagi reconnect).
      if (!sendResult.ok && sendResult.code === 'NO_SESSION') {
        if (item.retryCount >= MAX_WA_RETRY) {
          await markFailed(item.id, `WA session not connected after ${MAX_WA_RETRY} retries`)
          failed++
        } else {
          await prisma.followUpQueue.update({
            where: { id: item.id },
            data: {
              status: 'PENDING',
              sentAt: null,
              retryCount: { increment: 1 },
              scheduledAt: new Date(Date.now() + WA_RECONNECT_BACKOFF_MS),
              failedReason: 'WA session disconnected — retry later',
            },
          })
          retried++
        }
        continue
      }

      // Cloud API di luar window & template belum siap / kredit habis → tunda
      // 30 menit dengan alasan jelas. Customer opt-out marketing → SKIPPED.
      if (!sendResult.ok && (sendResult.code === 'NO_TEMPLATE' || sendResult.code === 'INSUFFICIENT_CREDIT')) {
        const reason =
          sendResult.code === 'INSUFFICIENT_CREDIT'
            ? 'Kredit pesan habis — top up untuk mengirim template Meta'
            : 'Template Meta belum disetujui / belum disiapkan'
        if (item.retryCount >= MAX_WA_RETRY) {
          await markFailed(item.id, reason)
          failed++
        } else {
          await prisma.followUpQueue.update({
            where: { id: item.id },
            data: {
              status: 'PENDING',
              sentAt: null,
              retryCount: { increment: 1 },
              scheduledAt: new Date(Date.now() + WA_RECONNECT_BACKOFF_MS),
              failedReason: reason,
            },
          })
          retried++
        }
        continue
      }
      if (!sendResult.ok && sendResult.code === 'MARKETING_OPT_OUT') {
        await markSkipped(item.id, 'Customer opt-out pesan marketing')
        skipped++
        continue
      }

      if (sendResult.ok) {
        // Status & sentAt sudah di-set saat claim di atas.
        await prisma.followUpLog.create({
          data: {
            userId: item.userId,
            orderId: item.orderId,
            liveLeadId: item.liveLeadId,
            templateId: item.templateId,
            queueId: item.id,
            customerPhone: item.customerPhone,
            message: item.resolvedMessage,
            status: 'SENT',
            source: 'AUTOMATIC',
          },
        })
        sent++
      } else {
        if (item.retryCount >= MAX_SEND_RETRY) {
          await markFailed(item.id, sendResult.error || 'Send failed')
          await prisma.followUpLog.create({
            data: {
              userId: item.userId,
              orderId: item.orderId,
              liveLeadId: item.liveLeadId,
              templateId: item.templateId,
              queueId: item.id,
              customerPhone: item.customerPhone,
              message: item.resolvedMessage,
              status: 'FAILED',
              errorMessage: sendResult.error || 'Send failed',
              source: 'AUTOMATIC',
            },
          })
          failed++
        } else {
          // Pengiriman gagal setelah claim → kembalikan ke PENDING dengan
          // backoff + catatan retry (claim sebelumnya sudah set SENT).
          await prisma.followUpQueue.update({
            where: { id: item.id },
            data: {
              status: 'PENDING',
              sentAt: null,
              retryCount: { increment: 1 },
              scheduledAt: new Date(Date.now() + RETRY_BACKOFF_MS),
              failedReason: sendResult.error,
            },
          })
          retried++
        }
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
