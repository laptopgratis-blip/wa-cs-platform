// Progres per-penerima broadcast Cloud API dari webhook statuses
// (delivered/read/failed). Semua transisi + counter ATOMIK (updateMany
// dengan guard status asal) — webhook bisa dobel/paralel/out-of-order.

import { prisma } from '@/lib/prisma'

/**
 * Terapkan status webhook ke satu BroadcastRecipient (by id — diambil dari
 * Message.broadcastRecipientId supaya tidak bergantung pada recipient.messageId
 * yang baru ditulis worker SETELAH kirim; webhook bisa datang lebih dulu).
 * Counter Broadcast di-increment hanya bila transisi benar-benar terjadi,
 * dan per-transisi spesifik supaya dua webhook paralel tidak dobel hitung.
 * Never-throw.
 */
export async function applyRecipientStatus(
  recipientId: string,
  kind: 'delivered' | 'read' | 'failed',
  err?: { code?: number; message?: string },
): Promise<void> {
  try {
    const rec = await prisma.broadcastRecipient.findUnique({
      where: { id: recipientId },
      select: { id: true, broadcastId: true },
    })
    if (!rec) return

    if (kind === 'delivered') {
      const r = await prisma.broadcastRecipient.updateMany({
        where: { id: rec.id, status: 'SENT' },
        data: { status: 'DELIVERED' },
      })
      if (r.count > 0) {
        await prisma.broadcast.update({
          where: { id: rec.broadcastId },
          data: { totalDelivered: { increment: 1 } },
        })
      }
      return
    }

    if (kind === 'read') {
      // Dua transisi terpisah supaya atomik: DELIVERED→READ (read saja) vs
      // SENT→READ (delivered terlewat → hitung delivered juga). Webhook
      // delivered paralel tidak bisa dobel karena guard status asal.
      const fromDelivered = await prisma.broadcastRecipient.updateMany({
        where: { id: rec.id, status: 'DELIVERED' },
        data: { status: 'READ' },
      })
      if (fromDelivered.count > 0) {
        await prisma.broadcast.update({
          where: { id: rec.broadcastId },
          data: { totalRead: { increment: 1 } },
        })
        return
      }
      const fromSent = await prisma.broadcastRecipient.updateMany({
        where: { id: rec.id, status: 'SENT' },
        data: { status: 'READ' },
      })
      if (fromSent.count > 0) {
        await prisma.broadcast.update({
          where: { id: rec.broadcastId },
          data: { totalRead: { increment: 1 }, totalDelivered: { increment: 1 } },
        })
      }
      return
    }

    // failed — hanya dari SENT/DELIVERED (READ tidak diturunkan). Pesan yang
    // sempat SENT dipindah hitungannya sent → failed.
    const r = await prisma.broadcastRecipient.updateMany({
      where: { id: rec.id, status: { in: ['SENT', 'DELIVERED'] } },
      data: {
        status: 'FAILED',
        errorCode: err?.code ?? null,
        errorMessage: err?.message ?? null,
      },
    })
    if (r.count > 0) {
      await prisma.broadcast.update({
        where: { id: rec.broadcastId },
        data: { totalSent: { decrement: 1 }, totalFailed: { increment: 1 } },
      })
    }
  } catch (e) {
    console.error('[broadcast/recipient-status] gagal:', e)
  }
}

/** Kompat: lookup recipient via Message lalu terapkan. */
export async function applyRecipientStatusByMessage(
  messageId: string,
  kind: 'delivered' | 'read' | 'failed',
  err?: { code?: number; message?: string },
): Promise<void> {
  try {
    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      select: { broadcastRecipientId: true },
    })
    if (!msg?.broadcastRecipientId) return
    await applyRecipientStatus(msg.broadcastRecipientId, kind, err)
  } catch (e) {
    console.error('[broadcast/recipient-status] byMessage gagal:', e)
  }
}
