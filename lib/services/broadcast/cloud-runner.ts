// Worker broadcast Cloud API (tanpa Redis): dipanggil dari `after()` saat
// start dan dari cron broadcast-send tiap menit. Satu run = satu batch:
// claim per-penerima (PENDING→SENDING atomik, yang kalah race di-skip) →
// sendCloudTemplate → update recipient + counter Broadcast (increment atomik).
//
// Kebijakan kegagalan:
// - INSUFFICIENT_CREDIT → recipient kembali PENDING, broadcast PAUSED (+alasan) → stop
// - TEMPLATE_PAUSED / TEMPLATE_NOT_APPROVED / PAYMENT_REQUIRED / TOKEN_INVALID
//   / SESSION_UNAVAILABLE → recipient PENDING, broadcast PAUSED → stop
// - MARKETING_OPT_OUT / BLACKLISTED → SKIPPED (+totalSkipped)
// - RATE_LIMIT → PENDING + attempt++ + jeda; setelah MAX_ATTEMPTS → FAILED
// - lainnya → FAILED (+totalFailed)
// - status CANCELLED terdeteksi → sisa PENDING → SKIPPED
// - recipient SENDING basi (>10 menit, proses mati) → kembali PENDING

import type { BroadcastRecipientStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { renderRecipientParams } from '@/lib/broadcast'
import { sendCloudTemplate } from '@/lib/services/waba/send-template'
import type { TemplateSendParams } from '@/lib/services/waba/template-payload'

const DEFAULT_MAX_PER_RUN = 150
const DEFAULT_DELAY_MS = 150
const RATE_LIMIT_BACKOFF_MS = 2_000
const MAX_ATTEMPTS = 3
const STALE_SENDING_MS = 10 * 60 * 1000

const PAUSE_CODES = new Set([
  'INSUFFICIENT_CREDIT',
  'TEMPLATE_PAUSED',
  'TEMPLATE_NOT_APPROVED',
  'TEMPLATE_WABA_MISMATCH',
  // Param tidak cocok bersifat DETERMINISTIK untuk semua penerima
  // (templateParams disimpan sekali di Broadcast; template bisa diedit di
  // antara create dan start) — tanpa pause, seluruh penerima habis FAILED.
  'TEMPLATE_PARAM_MISMATCH',
  'PAYMENT_REQUIRED',
  'TOKEN_INVALID',
  'SESSION_UNAVAILABLE',
])
const SKIP_CODES = new Set(['MARKETING_OPT_OUT', 'BLACKLISTED'])

export interface CloudBatchResult {
  broadcastId: string
  processed: number
  sent: number
  failed: number
  skipped: number
  paused: boolean
  completed: boolean
  stopReason?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runCloudBroadcastBatch(
  broadcastId: string,
  opts: { maxPerRun?: number; delayMs?: number } = {},
): Promise<CloudBatchResult> {
  const maxPerRun = opts.maxPerRun ?? DEFAULT_MAX_PER_RUN
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS
  const result: CloudBatchResult = {
    broadcastId,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    paused: false,
    completed: false,
  }

  try {
    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: {
        id: true,
        status: true,
        provider: true,
        waSessionId: true,
        templateId: true,
        templateParams: true,
        category: true,
      },
    })
    if (!broadcast || broadcast.provider !== 'CLOUD_API') {
      return { ...result, stopReason: 'bukan broadcast Cloud API' }
    }
    if (broadcast.status === 'CANCELLED') {
      await skipRemaining(broadcastId)
      return { ...result, stopReason: 'dibatalkan' }
    }
    if (broadcast.status !== 'SENDING') {
      return { ...result, stopReason: `status ${broadcast.status}` }
    }
    if (!broadcast.templateId) {
      await pauseBroadcast(broadcastId, 'Template tidak ditemukan')
      return { ...result, paused: true, stopReason: 'template kosong' }
    }

    await prisma.broadcast.update({ where: { id: broadcastId }, data: { lastBatchAt: new Date() } })

    // Lepas klaim basi (proses sebelumnya mati di tengah).
    await prisma.broadcastRecipient.updateMany({
      where: { broadcastId, status: 'SENDING', claimedAt: { lt: new Date(Date.now() - STALE_SENDING_MS) } },
      data: { status: 'PENDING', claimedAt: null },
    })

    const pending = await prisma.broadcastRecipient.findMany({
      where: { broadcastId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: maxPerRun,
      select: { id: true, contactId: true, phoneNumber: true, name: true, attempt: true },
    })

    const params = (broadcast.templateParams ?? { body: [] }) as unknown as TemplateSendParams

    for (const rec of pending) {
      // Re-cek status broadcast tiap beberapa item (cancel/pause dari UI) +
      // heartbeat lastBatchAt supaya cron tidak memulai batch paralel.
      if (result.processed % 5 === 0 && result.processed > 0) {
        const cur = await prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { status: true } })
        if (cur?.status === 'CANCELLED') {
          await skipRemaining(broadcastId)
          return { ...result, stopReason: 'dibatalkan di tengah' }
        }
        if (cur?.status !== 'SENDING') return { ...result, stopReason: `status ${cur?.status}` }
        await prisma.broadcast.update({ where: { id: broadcastId }, data: { lastBatchAt: new Date() } })
      }

      // Claim atomik.
      const claimed = await prisma.broadcastRecipient.updateMany({
        where: { id: rec.id, status: 'PENDING' },
        data: { status: 'SENDING', claimedAt: new Date(), attempt: { increment: 1 } },
      })
      if (claimed.count === 0) continue
      result.processed += 1

      const sendRes = await sendCloudTemplate({
        sessionId: broadcast.waSessionId,
        to: rec.phoneNumber,
        templateId: broadcast.templateId,
        params: renderRecipientParams(params, { name: rec.name, phoneNumber: rec.phoneNumber }),
        purpose: 'BROADCAST',
        source: 'BROADCAST',
        contactId: rec.contactId,
        broadcastRecipientId: rec.id,
        pushName: rec.name,
      })

      if (sendRes.success) {
        result.sent += 1
        // Guard status SENDING: cancel (skipRemaining) yang menang race saat
        // kirim in-flight sudah menandai SKIPPED — jangan timpa & jangan
        // dobel hitung. Webhook delivered/read juga bisa sudah menaikkan
        // status via recipient-status (guard asal SENT di sana).
        const marked = await prisma.broadcastRecipient.updateMany({
          where: { id: rec.id, status: 'SENDING' },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            externalMsgId: sendRes.data?.messageId ?? null,
            messageId: sendRes.data?.messageDbId ?? null,
            creditRp: sendRes.data?.chargedRp ?? 0,
            errorCode: null,
            errorMessage: null,
          },
        })
        if (marked.count > 0) {
          await prisma.broadcast.update({
            where: { id: broadcastId },
            data: {
              totalSent: { increment: 1 },
              chargedCreditRp: { increment: sendRes.data?.chargedRp ?? 0 },
            },
          })
        }
        if (delayMs > 0) await sleep(delayMs)
        continue
      }

      const code = sendRes.code ?? 'META_ERROR'
      if (PAUSE_CODES.has(code)) {
        await prisma.broadcastRecipient.update({
          where: { id: rec.id },
          data: { status: 'PENDING', claimedAt: null, attempt: { decrement: 1 } },
        })
        await pauseBroadcast(broadcastId, sendRes.error ?? code)
        result.paused = true
        result.stopReason = sendRes.error ?? code
        return result
      }
      if (SKIP_CODES.has(code)) {
        result.skipped += 1
        await setRecipient(rec.id, broadcastId, 'SKIPPED', sendRes.error, undefined, { totalSkipped: { increment: 1 } })
        continue
      }
      if (code === 'RATE_LIMIT') {
        if (rec.attempt + 1 >= MAX_ATTEMPTS) {
          result.failed += 1
          await setRecipient(rec.id, broadcastId, 'FAILED', sendRes.error, 130429, { totalFailed: { increment: 1 } })
        } else {
          await prisma.broadcastRecipient.update({
            where: { id: rec.id },
            data: { status: 'PENDING', claimedAt: null, errorMessage: sendRes.error ?? null },
          })
          await sleep(RATE_LIMIT_BACKOFF_MS)
        }
        continue
      }
      result.failed += 1
      await setRecipient(rec.id, broadcastId, 'FAILED', sendRes.error, undefined, { totalFailed: { increment: 1 } })
    }

    // Selesai? Tidak ada PENDING/SENDING tersisa.
    const remaining = await prisma.broadcastRecipient.count({
      where: { broadcastId, status: { in: ['PENDING', 'SENDING'] } },
    })
    if (remaining === 0) {
      await prisma.broadcast.updateMany({
        where: { id: broadcastId, status: 'SENDING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
      result.completed = true
    }
    return result
  } catch (err) {
    console.error(`[broadcast/cloud-runner] batch ${broadcastId} gagal:`, err)
    return { ...result, stopReason: (err as Error).message }
  }
}

async function setRecipient(
  id: string,
  broadcastId: string,
  status: BroadcastRecipientStatus,
  errorMessage?: string,
  errorCode?: number,
  counter?: Record<string, { increment: number }>,
): Promise<void> {
  await prisma.$transaction([
    prisma.broadcastRecipient.update({
      where: { id },
      data: { status, errorMessage: errorMessage ?? null, errorCode: errorCode ?? null },
    }),
    ...(counter ? [prisma.broadcast.update({ where: { id: broadcastId }, data: counter })] : []),
  ])
}

async function pauseBroadcast(broadcastId: string, reason: string): Promise<void> {
  await prisma.broadcast.updateMany({
    where: { id: broadcastId, status: 'SENDING' },
    data: { status: 'PAUSED', pausedReason: reason.slice(0, 500) },
  })
}

/** Sisa PENDING/SENDING → SKIPPED (broadcast dibatalkan). */
export async function skipRemaining(broadcastId: string): Promise<number> {
  const r = await prisma.broadcastRecipient.updateMany({
    where: { broadcastId, status: { in: ['PENDING', 'SENDING'] } },
    data: { status: 'SKIPPED', errorMessage: 'Broadcast dibatalkan' },
  })
  if (r.count > 0) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { totalSkipped: { increment: r.count } },
    })
  }
  return r.count
}
