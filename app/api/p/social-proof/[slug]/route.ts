// GET /api/p/social-proof/[slug] — public endpoint, no auth.
// Return list pembeli sebelumnya untuk popup social proof di public order form.
// Privacy: hanya nama depan + nama kota (tanpa nama akhir, alamat, no HP).
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

// Cache di edge/proxy 5 menit — data update relatif lambat (per order PAID
// baru). Hindari hit DB tiap pageview popup.
const CACHE_MAX_AGE_SEC = 300
// Ambil cukup banyak supaya popup punya pool variasi, tapi jangan banyak-banyak
// untuk hemat payload network ke browser publik.
const PROOF_LIMIT = 30
// Jangan tampilkan order yang lebih lama dari 60 hari — biar terasa "baru" /
// relevan, dan engineer audit-friendly (bukan fake bukti hingga ada order baru).
const MAX_AGE_DAYS = 60

function firstName(full: string): string {
  // Ambil first word saja, max 16 chars supaya tidak overflow di popup.
  // Edge case: kalau nama satu kata "Budiono", tetap kepake tapi truncated.
  const trimmed = full.trim()
  if (!trimmed) return 'Pembeli'
  const first = trimmed.split(/\s+/)[0] ?? trimmed
  return first.slice(0, 16)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const form = await prisma.orderForm.findUnique({
    where: { slug },
    select: {
      userId: true,
      isActive: true,
      socialProofEnabled: true,
      socialProofPosition: true,
      socialProofIntervalSec: true,
      socialProofShowTime: true,
    },
  })
  if (!form || !form.isActive || !form.socialProofEnabled) {
    return NextResponse.json(
      { success: true, data: { entries: [] } },
      { headers: { 'cache-control': `public, max-age=${CACHE_MAX_AGE_SEC}` } },
    )
  }

  const sinceDate = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)

  const orders = await prisma.userOrder.findMany({
    where: {
      userId: form.userId,
      paymentStatus: 'PAID',
      createdAt: { gte: sinceDate },
      // City/customerName harus terisi supaya entry useful. Order tanpa city
      // (mis. produk digital) di-skip — popup bilang "Budi - Jakarta - …",
      // butuh kota.
      shippingCityName: { not: null },
      customerName: { not: '' },
    },
    select: {
      customerName: true,
      shippingCityName: true,
      paidAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: PROOF_LIMIT,
  })

  const entries = orders
    .map((o) => ({
      name: firstName(o.customerName),
      city: (o.shippingCityName ?? '').trim(),
      // Timestamp ditampilkan sebagai relative time di UI ("2 jam lalu").
      ts: (o.paidAt ?? o.createdAt).toISOString(),
    }))
    .filter((e) => e.city.length > 0)

  return NextResponse.json(
    {
      success: true,
      data: {
        entries,
        intervalSec: form.socialProofIntervalSec,
        position: form.socialProofPosition,
        showTime: form.socialProofShowTime,
      },
    },
    { headers: { 'cache-control': `public, max-age=${CACHE_MAX_AGE_SEC}` } },
  )
}
