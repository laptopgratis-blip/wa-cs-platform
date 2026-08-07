import type { Prisma } from '@prisma/client'

// "Siap kemas" = belum dikirim & tidak dibatalkan & (COD atau sudah lunas).
// Transfer yang belum bayar SENGAJA tidak dihitung — jangan dikirim sebelum
// bayar. Single source of truth: dipakai warehouse-summary (strip fulfillment)
// & halaman packing list, supaya angka strip == isi packing list.
// Order digital-only (e-book/course, dari form requireShipping=false) juga
// dikecualikan — tidak ada barang fisik untuk dikemas.
export function readyToPackWhere(userId: string): Prisma.UserOrderWhereInput {
  return {
    userId,
    deliveryStatus: 'PENDING',
    paymentStatus: { not: 'CANCELLED' },
    isDigitalOnly: false,
    OR: [{ paymentMethod: 'COD' }, { paymentStatus: 'PAID' }],
  }
}
