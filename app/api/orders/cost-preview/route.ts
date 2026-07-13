// POST /api/orders/cost-preview (PUBLIC, no-auth)
// Customer di public form butuh fetch ongkir tanpa auth. Origin & kurir diambil
// dari OrderForm.user.shippingProfile (validated by slug).
//
// Body: { slug, destination (number), weight (number) }
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { getClientIp } from '@/lib/client-ip'
import { prisma } from '@/lib/prisma'
import { describeZone, findMatchingZone } from '@/lib/services/order-pricing'
import { checkCostPreviewLimit } from '@/lib/services/shipping-rate-limit'
import { pickBestWarehouse } from '@/lib/services/warehouse-selector'

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

  const limit = checkCostPreviewLimit(getClientIp(req))
  if (!limit.ok) {
    return jsonError(
      'Terlalu banyak permintaan ongkir. Tunggu sebentar lalu coba lagi.',
      429,
    )
  }

  try {
    const form = await prisma.orderForm.findUnique({
      where: { slug: parsed.data.slug },
      include: {
        user: {
          select: {
            shippingProfile: {
              select: {
                originCityId: true,
                enabledCouriers: true,
                defaultWeightGrams: true,
              },
            },
          },
        },
      },
    })
    if (!form || !form.isActive) {
      return jsonError('Form tidak ditemukan / tidak aktif', 404)
    }
    const profile = form.user.shippingProfile
    if (!profile || profile.enabledCouriers.length === 0) {
      return jsonError('Penjual belum setup pengiriman', 400)
    }

    // Multi-gudang: pilih gudang termurah untuk tujuan ini. Selector fallback
    // ke origin UserShippingProfile kalau penjual belum punya gudang.
    const pick = await pickBestWarehouse({
      userId: form.userId,
      destinationId: parsed.data.destination,
      destCityName: parsed.data.cityName,
      destProvinceName: parsed.data.provinceName,
      // Floor berat ke defaultWeightGrams penjual — sama dengan
      // calculateOrderTotal saat submit — supaya berat (dan gudang yang
      // dipilih) identik preview↔submit, dan estimasi ongkir = final.
      weight: Math.max(parsed.data.weight, profile.defaultWeightGrams),
      couriers: profile.enabledCouriers as string[],
    })
    if (!pick) {
      return jsonError('Penjual belum setup pengiriman', 400)
    }
    const { services, degraded } = pick

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
      degraded,
      // Info gudang asal → form tampilkan "📦 Dikirim dari <nama gudang>".
      warehouse: { name: pick.name, cityName: pick.cityName },
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
