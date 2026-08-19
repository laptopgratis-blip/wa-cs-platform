// Mulai/lanjutkan broadcast — satu pintu untuk route /send dan cron
// broadcast-send (SCHEDULED due). Cabang by provider:
//   BAILEYS   → bangun items + waService.startBroadcast (loop di wa-service)
//   CLOUD_API → BroadcastRecipient (createMany) → estimasi kredit → cek saldo
//               → SENDING + after(runCloudBroadcastBatch) (lanjutan via cron)

import type { PipelineStage } from '@prisma/client'
import { after } from 'next/server'

import { buildTargetWhere, renderBroadcastMessage } from '@/lib/broadcast'
import { prisma } from '@/lib/prisma'
import { formatRp, getMessageCreditBalance, getMessageCreditRates } from '@/lib/services/message-credits'
import { waService } from '@/lib/wa-service'

import { runCloudBroadcastBatch } from './cloud-runner'

export type StartBroadcastResult =
  | { ok: true; status: 'SENDING' | 'COMPLETED'; totalTargets: number; estimatedCreditRp?: number }
  | { ok: false; error: string; httpStatus?: number }

export async function startBroadcast(
  broadcastId: string,
  opts: { userId?: string; trigger: 'user' | 'cron' },
): Promise<StartBroadcastResult> {
  const broadcast = await loadForStart(broadcastId)
  if (!broadcast || (opts.userId && broadcast.userId !== opts.userId)) {
    return { ok: false, error: 'Broadcast tidak ditemukan', httpStatus: 404 }
  }

  const resumable = broadcast.status === 'PAUSED' && broadcast.provider === 'CLOUD_API'
  if (broadcast.status !== 'DRAFT' && broadcast.status !== 'SCHEDULED' && !resumable) {
    return { ok: false, error: `Broadcast tidak bisa dijalankan dari status ${broadcast.status}` }
  }

  if (broadcast.provider === 'CLOUD_API' || broadcast.waSession.provider === 'CLOUD_API') {
    return startCloudBroadcast(broadcast)
  }
  return startBaileysBroadcast(broadcast)
}

type LoadedBroadcast = NonNullable<Awaited<ReturnType<typeof loadForStart>>>
async function loadForStart(id: string) {
  return prisma.broadcast.findUnique({
    where: { id },
    include: {
      waSession: { select: { id: true, provider: true, wabaId: true, status: true, user: { select: { role: true } } } },
      template: { select: { id: true, status: true, category: true, wabaId: true, name: true } },
    },
  })
}

async function startBaileysBroadcast(broadcast: LoadedBroadcast): Promise<StartBroadcastResult> {
  const contacts = await prisma.contact.findMany({
    where: buildTargetWhere({
      userId: broadcast.userId,
      waSessionId: broadcast.waSessionId,
      tags: broadcast.targetTags,
      stages: broadcast.targetStages as PipelineStage[],
    }) as never,
    select: { id: true, phoneNumber: true, name: true },
  })

  if (contacts.length === 0) {
    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: 'COMPLETED', totalTargets: 0, startedAt: new Date(), completedAt: new Date() },
    })
    return { ok: false, error: 'Tidak ada kontak yang cocok dengan filter' }
  }

  const items = contacts.map((c) => ({
    phoneNumber: c.phoneNumber,
    content: renderBroadcastMessage(broadcast.message, { name: c.name, phoneNumber: c.phoneNumber }),
  }))

  // Tandai SENDING dulu, baru trigger wa-service. Kalau wa-service nolak,
  // rollback ke FAILED supaya user tahu.
  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: { status: 'SENDING', totalTargets: items.length, totalSent: 0, totalFailed: 0, startedAt: new Date() },
  })
  const result = await waService.startBroadcast({ sessionId: broadcast.waSessionId, broadcastId: broadcast.id, items })
  if (!result.success) {
    await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: 'FAILED' } })
    return { ok: false, error: result.error || 'wa-service gagal merespons', httpStatus: 502 }
  }
  return { ok: true, status: 'SENDING', totalTargets: items.length }
}

async function startCloudBroadcast(broadcast: LoadedBroadcast): Promise<StartBroadcastResult> {
  const tpl = broadcast.template
  if (!tpl) return { ok: false, error: 'Broadcast Cloud API butuh template Meta — pilih template saat membuat broadcast' }
  if (tpl.status !== 'APPROVED') {
    return { ok: false, error: `Template "${tpl.name}" berstatus ${tpl.status} — hanya template APPROVED yang bisa dikirim` }
  }
  if (broadcast.waSession.wabaId && tpl.wabaId !== broadcast.waSession.wabaId) {
    return { ok: false, error: 'Template milik WABA lain dari nomor pengirim' }
  }
  if (broadcast.waSession.status === 'DISCONNECTED') {
    return { ok: false, error: 'Nomor Cloud API sudah diputus — hubungkan ulang' }
  }

  // Target saat ini (MARKETING → kecualikan opt-out). Resume: createMany
  // skipDuplicates hanya menambah yang belum ada.
  const contacts = await prisma.contact.findMany({
    where: buildTargetWhere({
      userId: broadcast.userId,
      waSessionId: broadcast.waSessionId,
      tags: broadcast.targetTags,
      stages: broadcast.targetStages as PipelineStage[],
      excludeMarketingOptOut: tpl.category === 'MARKETING',
    }) as never,
    select: { id: true, phoneNumber: true, name: true },
  })
  if (contacts.length > 0) {
    await prisma.broadcastRecipient.createMany({
      data: contacts.map((c) => ({
        broadcastId: broadcast.id,
        contactId: c.id,
        phoneNumber: c.phoneNumber,
        name: c.name,
      })),
      skipDuplicates: true,
    })
  }
  const [totalTargets, pendingCount] = await Promise.all([
    prisma.broadcastRecipient.count({ where: { broadcastId: broadcast.id } }),
    prisma.broadcastRecipient.count({ where: { broadcastId: broadcast.id, status: 'PENDING' } }),
  ])
  if (totalTargets === 0) {
    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: 'COMPLETED', totalTargets: 0, startedAt: new Date(), completedAt: new Date() },
    })
    return { ok: false, error: 'Tidak ada kontak yang cocok dengan filter (kontak opt-out/blacklist dikecualikan)' }
  }
  if (pendingCount === 0) {
    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: 'COMPLETED', totalTargets, completedAt: new Date() },
    })
    return { ok: true, status: 'COMPLETED', totalTargets }
  }

  // Estimasi konservatif: semua pesan berbayar (UTILITY dalam window gratis
  // dikoreksi saat kirim/rekonsiliasi). Sesi admin (platform) tidak ditagih.
  const rates = await getMessageCreditRates()
  const rate = rates[tpl.category]
  const isPlatform = broadcast.waSession.user.role === 'ADMIN'
  const estimated = isPlatform ? 0 : pendingCount * rate
  if (!isPlatform && estimated > 0) {
    const balance = await getMessageCreditBalance(broadcast.userId)
    if (balance < estimated) {
      return {
        ok: false,
        error: `Kredit pesan kurang: butuh ± ${formatRp(estimated)} untuk ${pendingCount} pesan ${tpl.category.toLowerCase()}, saldo ${formatRp(balance)}. Top up di menu Billing.`,
        httpStatus: 402,
      }
    }
  }

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: {
      status: 'SENDING',
      provider: 'CLOUD_API',
      category: tpl.category,
      totalTargets,
      estimatedCreditRp: estimated,
      pausedReason: null,
      startedAt: broadcast.startedAt ?? new Date(),
      lastBatchAt: new Date(),
    },
  })

  // Batch pertama langsung (setelah respons terkirim); lanjutan via cron.
  after(async () => {
    try {
      await runCloudBroadcastBatch(broadcast.id)
    } catch (err) {
      console.error('[broadcast/start] batch pertama gagal:', err)
    }
  })

  return { ok: true, status: 'SENDING', totalTargets, estimatedCreditRp: estimated }
}
