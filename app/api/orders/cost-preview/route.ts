// POST /api/orders/cost-preview (PUBLIC, no-auth)
// Customer di public form butuh fetch ongkir tanpa auth. Origin & kurir diambil
// dari OrderForm.user.shippingProfile (validated by slug).
//
// Body: { slug, destination (number), weight (number) }
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { describeZone, findMatchingZone } from '@/lib/services/order-pricing'
import { calculateShippingCost } from '@/lib/services/rajaongkir'

const schema = z.object({
  slug: z.string().min(1),
  destination: z.number().int().positive(),
  weight: z.number().int().min(1).max(150_000),
  // Nama kota/provinsi tujuan — dipakai match zona subsidi ongkir supaya
  // preview di form sama dengan hitungan server saat submit.
  cityName: z.string().max(120).optional(),
  provinceName: z.string().max(120).optional(),
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => null)
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const form = await prisma.orderForm.findUnique({
      where: { slug: parsed.data.slug },
      include: {
        user: {
          select: {
            shippingProfile: {
              select: { originCityId: true, enabledCouriers: true },
            },
          },
        },
      },
    })
    if (!form || !form.isActive) {
      return jsonError('Form tidak ditemukan / tidak aktif', 404)
    }
    const profile = form.user.shippingProfile
    if (!profile?.originCityId || profile.enabledCouriers.length === 0) {
      return jsonError('Penjual belum setup pengiriman', 400)
    }

    const services = await calculateShippingCost({
      origin: Number(profile.originCityId),
      destination: parsed.data.destination,
      weight: parsed.data.weight,
      couriers: profile.enabledCouriers as string[],
    })

    // Zona subsidi ongkir untuk tujuan ini (kalau ada) — client pakai untuk
    // tampilkan ongkir setelah subsidi + keterangannya, konsisten dengan
    // calculateOrderTotal saat submit.
    const zone = await findMatchingZone({
      userId: form.userId,
      cityName: parsed.data.cityName,
      provinceName: parsed.data.provinceName,
    })

    return jsonOk({
      services,
      zone: zone
        ? {
            name: zone.name,
            description: describeZone(zone),
            subsidyType: zone.subsidyType,
            subsidyValue: zone.subsidyValue,
            minimumOrder: zone.minimumOrder,
          }
        : null,
    })
  } catch (err) {
    console.error('[POST /api/orders/cost-preview] gagal:', err)
    return jsonError('Gagal hitung ongkir', 500)
  }
}
