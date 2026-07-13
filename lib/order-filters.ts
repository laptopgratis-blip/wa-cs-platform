import type { Prisma } from '@prisma/client'

// Base-where filter pesanan (field-level) — SATU sumber kebenaran dipakai
// bersama oleh GET /api/orders (list + counts) dan GET /api/orders/export (CSV)
// supaya isi export SELALU sama dengan yang tampil di list. Sebelumnya export
// meniru sebagian filter → melenceng (mis. filter per gudang tak terpakai).
//
// Cakupan: q (search), tag, rentang tanggal (from/to), metode bayar (pm),
// produk (productId), gudang (warehouseId). TIDAK termasuk tab & smart filter
// (di-handle terpisah di masing-masing route).
export function buildOrderBaseWhere(
  sp: URLSearchParams,
  userId: string,
): Prisma.UserOrderWhereInput {
  const where: Prisma.UserOrderWhereInput = { userId }

  const q = (sp.get('q') ?? '').trim()
  if (q) {
    where.OR = [
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q, mode: 'insensitive' } },
      { customerEmail: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
      { notesAdmin: { contains: q, mode: 'insensitive' } },
      { invoiceNumber: { contains: q, mode: 'insensitive' } },
      { trackingNumber: { contains: q, mode: 'insensitive' } },
    ]
  }

  const tagIds = sp
    .getAll('tag')
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
  if (tagIds.length > 0) {
    where.tags = { some: { id: { in: tagIds } } }
  }

  const dateRange: Prisma.DateTimeFilter = {}
  const fromRaw = sp.get('from')
  const toRaw = sp.get('to')
  if (fromRaw) {
    const d = new Date(fromRaw)
    if (!Number.isNaN(d.getTime())) dateRange.gte = d
  }
  if (toRaw) {
    const d = new Date(toRaw)
    if (!Number.isNaN(d.getTime())) dateRange.lte = d
  }
  if (Object.keys(dateRange).length > 0) {
    where.createdAt = dateRange
  }

  const pm = sp.get('pm')?.toUpperCase()
  if (pm === 'COD' || pm === 'TRANSFER') {
    where.paymentMethod = pm
  }

  const productId = sp.get('productId')?.trim()
  if (productId) {
    where.items = { array_contains: [{ productId }] }
  }

  // Filter gudang asal (fulfillment). '__none__' = order tanpa gudang.
  const warehouseId = sp.get('warehouseId')?.trim()
  if (warehouseId) {
    where.warehouseId = warehouseId === '__none__' ? null : warehouseId
  }

  return where
}
