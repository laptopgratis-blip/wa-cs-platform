// GET /api/shipping/provinces?q=jaw
// Daftar provinsi (distinct) dari master lokal ShippingDestination —
// TANPA hit Komerce (hemat kuota), karena provinsi cuma ±38 dan master
// destinasi sudah di-seed lengkap. Dipakai ProvincePicker di form zona
// ongkir (pilih provinsi include / exclude).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    await requireOrderSystemAccess()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  try {
    const rows = await prisma.shippingDestination.findMany({
      where: q
        ? { provinceName: { contains: q, mode: 'insensitive' } }
        : undefined,
      distinct: ['provinceName'],
      select: { provinceName: true },
      orderBy: { provinceName: 'asc' },
      take: 50,
    })
    return jsonOk({ items: rows.map((r) => r.provinceName) })
  } catch (err) {
    console.error('[GET /api/shipping/provinces] gagal:', err)
    return jsonError('Gagal memuat daftar provinsi', 500)
  }
}
