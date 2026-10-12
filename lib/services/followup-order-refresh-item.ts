// Penyegaran SATU item antrean follow-up PENDING setelah data pelanggan
// pesanan diedit — dipanggil per item oleh followup-order-refresh.ts.
//
// Dipisah dari service dan menerima `db` sebagai parameter (bukan singleton
// Prisma) supaya alur tulis — optimistic lock pesan, guard status PENDING,
// reset resolvedParams — bisa diuji tanpa database
// (followup-order-refresh-item.test.ts).

import { Prisma } from '@prisma/client'

import { planQueueRefresh } from '@/lib/services/orders/customer-edit'

import {
  type ResolveContext,
  resolveTemplateVariables,
} from './followup-variables'

/** Item PENDING seperti yang dibaca service (snapshot saat `findMany`). */
export interface PendingQueueItem {
  id: string
  resolvedMessage: string
  template: { message: string }
}

/**
 * 'refreshed' = pesan + nomor + param diperbarui · 'kept' = pesan dibiarkan
 * (editan manual), nomor + param diperbarui · 'gone' = item sudah bukan
 * PENDING (mis. baru saja di-claim cron) → tidak disentuh.
 */
export type QueueItemOutcome = 'refreshed' | 'kept' | 'gone'

/** Potongan klien Prisma yang dipakai di sini — `prisma` memenuhinya. */
export interface QueueRefreshDb {
  followUpQueue: {
    updateMany(args: {
      where: { id: string; status: 'PENDING'; resolvedMessage?: string }
      data: {
        customerPhone: string
        resolvedParams: typeof Prisma.DbNull
        resolvedMessage?: string
      }
    }): PromiseLike<{ count: number }>
  }
}

export async function refreshQueueItem(
  db: QueueRefreshDb,
  item: PendingQueueItem,
  newPhone: string,
  oldCtx: ResolveContext,
  newCtx: ResolveContext,
): Promise<QueueItemOutcome> {
  const newResolved = resolveTemplateVariables(item.template.message, newCtx)
  const plan = planQueueRefresh({
    oldResolved: resolveTemplateVariables(item.template.message, oldCtx),
    currentResolved: item.resolvedMessage,
    newResolved,
  })
  const delivery = { customerPhone: newPhone, resolvedParams: Prisma.DbNull }

  if (plan === 'replace') {
    // Guard `resolvedMessage` = optimistic lock: kalau seller mengedit pesan
    // di antara baca & tulis, baris tidak cocok → jatuh ke jalur 'kept'.
    const replaced = await db.followUpQueue.updateMany({
      where: {
        id: item.id,
        status: 'PENDING',
        resolvedMessage: item.resolvedMessage,
      },
      data: { ...delivery, resolvedMessage: newResolved },
    })
    if (replaced.count > 0) return 'refreshed'
  }

  // Guard status PENDING: item yang baru saja di-claim cron (PENDING → SENT)
  // tidak ikut diubah.
  const kept = await db.followUpQueue.updateMany({
    where: { id: item.id, status: 'PENDING' },
    data: delivery,
  })
  return kept.count > 0 ? 'kept' : 'gone'
}
