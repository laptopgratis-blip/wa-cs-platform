// Segarkan antrean follow-up PENDING milik satu order setelah data pelanggan
// (nama / nomor HP / alamat / kode pos) diedit seller di detail pesanan.
//
// FollowUpQueue menyimpan SNAPSHOT saat antrean dibuat: customerPhone,
// resolvedMessage dan resolvedParams. Tanpa penyegaran, reminder yang masih
// terjadwal tetap terkirim ke nomor salah ketik / menyebut alamat lama.
//
// Aturan:
//   - HANYA item PENDING. SENT/FAILED/SKIPPED/CANCELLED adalah riwayat — tidak
//     disentuh.
//   - customerPhone → nomor terbaru order.
//   - resolvedMessage dihitung ulang HANYA bila belum diedit manual: isi
//     antrean dibandingkan dengan hasil resolve memakai data order LAMA
//     (`previousOrder`, snapshot SEBELUM update). Beda sedikit pun = editan
//     seller (PATCH /api/followup/queue/[id]) → pesan dibiarkan.
//   - resolvedParams → DbNull supaya param Template Meta dihitung ulang dari
//     data order terbaru saat kirim (ensureResolvedParams di followup-sender).
//     Param berasal dari peta variabel template, bukan dari pesan bebas, jadi
//     aman di-reset walau pesan diedit manual.
//
// Blacklist: TIDAK ditangani di sini. Cron followup-send dan send-now sudah
// mengecek FollowUpBlacklist memakai FollowUpQueue.customerPhone tepat sebelum
// kirim dan menandai SKIPPED 'Customer in blacklist'. Begitu nomor antrean
// diperbarui ke nomor yang ter-blacklist, pengecekan itu otomatis berlaku —
// satu pintu, tanpa duplikasi aturan (dan tetap benar bila blacklist dicabut
// sebelum jadwal kirim).
//
// Keterbatasan yang disengaja: "hasil resolve lama" dihitung dengan template,
// rekening dan profil toko SAAT INI. Bila salah satunya berubah sejak antrean
// dibuat, pesan terlihat seperti editan manual → dibiarkan (nomor tujuan &
// param tetap diperbarui). Lebih aman membiarkan daripada menimpa editan.
//
// NEVER throw — dipanggil best-effort dari PATCH /api/orders/[id]; kegagalan
// di sini tidak boleh menggagalkan penyimpanan pesanan.

import type { UserOrder } from '@prisma/client'

import { prisma } from '@/lib/prisma'

import { refreshQueueItem } from './followup-order-refresh-item'
import { loadSellerResolveExtras } from './followup-resolve-context'
import type { ResolveContext } from './followup-variables'

export interface FollowUpRefreshResult {
  /** Jumlah item PENDING milik order saat dibaca. */
  pending: number
  /** Item yang pesan + nomor + param-nya diperbarui. */
  messagesRefreshed: number
  /** Item yang pesannya dibiarkan (editan manual); nomor + param diperbarui. */
  messagesKept: number
  /** Terisi bila penyegaran gagal (sebagian atau seluruhnya). */
  error?: string
}

const NOTHING: FollowUpRefreshResult = {
  pending: 0,
  messagesRefreshed: 0,
  messagesKept: 0,
}

export async function refreshPendingFollowUpsForOrder(input: {
  orderId: string
  /** Baris order SEBELUM update — dasar deteksi "pesan belum diedit manual". */
  previousOrder: UserOrder
}): Promise<FollowUpRefreshResult> {
  const { orderId, previousOrder } = input
  try {
    const pending = await prisma.followUpQueue.findMany({
      where: { orderId, status: 'PENDING' },
      select: {
        id: true,
        resolvedMessage: true,
        template: { select: { message: true } },
      },
    })
    if (pending.length === 0) return NOTHING

    const order = await prisma.userOrder.findUnique({
      where: { id: orderId },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!order) return NOTHING

    const extras = await loadSellerResolveExtras(order.userId)
    const newCtx: ResolveContext = { order, user: order.user, ...extras }
    const oldCtx: ResolveContext = { ...newCtx, order: previousOrder }

    let messagesRefreshed = 0
    let messagesKept = 0
    let failed = 0
    for (const item of pending) {
      try {
        // Tulis per item (optimistic lock pesan + guard PENDING) ada di
        // followup-order-refresh-item.ts — teruji tanpa database.
        const outcome = await refreshQueueItem(
          prisma,
          item,
          order.customerPhone,
          oldCtx,
          newCtx,
        )
        if (outcome === 'refreshed') messagesRefreshed += 1
        else if (outcome === 'kept') messagesKept += 1
      } catch (err) {
        failed += 1
        console.error(
          `[followup-order-refresh] gagal memperbarui antrean ${item.id} (order ${orderId}):`,
          err,
        )
      }
    }

    return {
      pending: pending.length,
      messagesRefreshed,
      messagesKept,
      ...(failed > 0
        ? { error: `${failed} antrean follow-up gagal diperbarui` }
        : {}),
    }
  } catch (err) {
    console.error(
      `[followup-order-refresh] gagal menyegarkan antrean order ${orderId}:`,
      err,
    )
    return { ...NOTHING, error: (err as Error).message }
  }
}
