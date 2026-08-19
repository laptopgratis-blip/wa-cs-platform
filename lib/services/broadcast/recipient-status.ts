// Progres per-penerima broadcast Cloud API dari webhook statuses
// (delivered/read/failed). Guard progresi via updateMany + increment atomik
// di Broadcast — tanpa JSON results O(n²).

import type { BroadcastRecipientStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const OVERWRITABLE: Record<'delivered' | 'read' | 'failed', BroadcastRecipientStatus[]> = {
  delivered: ['SENT'],
  read: ['SENT', 'DELIVERED'],
  failed: ['SENT', 'DELIVERED'],
}
const TARGET: Record<'delivered' | 'read' | 'failed', BroadcastRecipientStatus> = {
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
}

/**
 * Terapkan status webhook ke BroadcastRecipient yang terkait Message ini.
 * No-op bila Message bukan bagian broadcast. Never-throw.
 */
export async function applyRecipientStatusByMessage(
  messageId: string,
  kind: 'delivered' | 'read' | 'failed',
  err?: { code?: number; message?: string },
): Promise<void> {
  try {
    const rec = await prisma.broadcastRecipient.findFirst({
      where: { messageId },
      select: { id: true, broadcastId: true, status: true },
    })
    if (!rec) return
    const wasDelivered = rec.status === 'DELIVERED' || rec.status === 'READ'
    const updated = await prisma.broadcastRecipient.updateMany({
      where: { id: rec.id, status: { in: OVERWRITABLE[kind] } },
      data: {
        status: TARGET[kind],
        ...(kind === 'failed' ? { errorCode: err?.code ?? null, errorMessage: err?.message ?? null } : {}),
      },
    })
    if (updated.count === 0) return

    if (kind === 'delivered') {
      await prisma.broadcast.update({ where: { id: rec.broadcastId }, data: { totalDelivered: { increment: 1 } } })
    } else if (kind === 'read') {
      // READ langsung dari SENT (delivered terlewat) → hitung delivered juga.
      await prisma.broadcast.update({
        where: { id: rec.broadcastId },
        data: { totalRead: { increment: 1 }, ...(wasDelivered ? {} : { totalDelivered: { increment: 1 } }) },
      })
    } else {
      // Gagal setelah sempat SENT → pindahkan hitungan sent → failed.
      await prisma.broadcast.update({
        where: { id: rec.broadcastId },
        data: { totalSent: { decrement: 1 }, totalFailed: { increment: 1 } },
      })
    }
  } catch (e) {
    console.error('[broadcast/recipient-status] gagal:', e)
  }
}
