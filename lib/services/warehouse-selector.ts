// Multi-gudang (Fase 2) — pilih gudang asal TERMURAH untuk sebuah tujuan.
//
// Dipakai bersama oleh cost-preview (daftar kurir di form publik),
// calculateOrderTotal (submit — sumber kebenaran), dan CS AI ongkir. Kunci
// konsistensi: SEMUA pemanggil harus kirim `couriers` yang SAMA (full
// enabledCouriers) + `weight` yang SAMA supaya gudang yang dipilih
// deterministik & identik antara preview dan submit — kalau tidak, customer
// bisa lihat ongkir gudang A tapi tercatat kirim dari gudang B.
//
// Hemat kuota RajaOngkir: gudang di-prefilter geografis (kota → provinsi →
// region) lalu cost-compare hanya kandidat terdekat (cap MAX_CANDIDATES). User
// dengan 1 gudang = 0 panggilan ekstra (persis perilaku origin tunggal lama).
import type { Warehouse } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { calculateShippingCost, type ShippingService } from '@/lib/services/rajaongkir'
import { regionOfProvince } from '@/lib/services/region-map'

// Metadata gudang asal tanpa hasil ongkir — cukup untuk tahu "kirim dari mana".
export interface WarehouseOrigin {
  // null = fallback ke UserShippingProfile origin lama (belum ada gudang).
  warehouseId: string | null
  originId: number
  name: string
  cityName: string
  provinceName: string
}

export interface WarehousePick extends WarehouseOrigin {
  services: ShippingService[]
  degraded: boolean
}

// Maksimum gudang yang di-cost-compare per quote — batasi panggilan API.
const MAX_CANDIDATES = 3

function minCost(services: ShippingService[]): number {
  let min = Number.POSITIVE_INFINITY
  for (const s of services) if (s.cost < min) min = s.cost
  return min
}

// Rank gudang by kedekatan geografis ke tujuan (kota → provinsi → region →
// sisanya). Stabil: dalam tier sama, urutan awal (isDefault dulu, lalu
// createdAt) dipertahankan → gudang default jadi tie-breaker alami.
export function rankByProximity(
  warehouses: Warehouse[],
  destCityName?: string | null,
  destProvinceName?: string | null,
): Warehouse[] {
  const destRegion = regionOfProvince(destProvinceName)
  const destCity = (destCityName ?? '').toUpperCase().trim()
  const destProv = (destProvinceName ?? '').toUpperCase().trim()
  return warehouses
    .map((w) => {
      let tier = 3
      if (destCity && w.cityName.toUpperCase().includes(destCity)) tier = 0
      else if (destProv && w.provinceName.toUpperCase() === destProv) tier = 1
      else if (destRegion !== 'LAINNYA' && w.regionCode === destRegion) tier = 2
      return { w, tier }
    })
    .sort((a, b) => a.tier - b.tier)
    .map((r) => r.w)
}

// Origin dari UserShippingProfile lama (backward-compat) — dipakai kalau user
// belum punya gudang sama sekali.
async function resolveLegacyOrigin(userId: string): Promise<WarehouseOrigin | null> {
  const profile = await prisma.userShippingProfile.findUnique({
    where: { userId },
    select: {
      originCityId: true,
      originCityName: true,
      originProvinceName: true,
    },
  })
  const originId = Number(profile?.originCityId)
  if (!profile?.originCityId || !Number.isFinite(originId)) return null
  return {
    warehouseId: null,
    originId,
    name: 'Gudang Utama',
    cityName: profile.originCityName ?? '',
    provinceName: profile.originProvinceName ?? '',
  }
}

// Pilih gudang asal TANPA cost-compare (0 panggilan RajaOngkir) — untuk COD
// flat-rate yang tak menghitung ongkir tapi tetap perlu tahu gudang asal untuk
// fulfillment. Ambil gudang terdekat geografis; gudang default jadi tie-break
// saat tak ada tujuan / tak ada yang match. Fallback origin lama kalau belum
// ada gudang.
export async function pickNearestWarehouse(input: {
  userId: string
  destCityName?: string | null
  destProvinceName?: string | null
}): Promise<WarehouseOrigin | null> {
  const warehouses = await prisma.warehouse.findMany({
    where: { userId: input.userId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
  if (warehouses.length === 0) return resolveLegacyOrigin(input.userId)
  const w =
    warehouses.length === 1
      ? warehouses[0]
      : rankByProximity(warehouses, input.destCityName, input.destProvinceName)[0]
  return {
    warehouseId: w.id,
    originId: w.originId,
    name: w.name,
    cityName: w.cityName,
    provinceName: w.provinceName,
  }
}

export async function pickBestWarehouse(input: {
  userId: string
  destinationId: number
  destCityName?: string | null
  destProvinceName?: string | null
  weight: number
  couriers: string[]
}): Promise<WarehousePick | null> {
  const warehouses = await prisma.warehouse.findMany({
    where: { userId: input.userId, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })

  // ── Fallback legacy: belum ada gudang → pakai origin UserShippingProfile.
  if (warehouses.length === 0) {
    const origin = await resolveLegacyOrigin(input.userId)
    if (!origin) return null
    const { services, degraded } = await calculateShippingCost({
      origin: origin.originId,
      destination: input.destinationId,
      weight: input.weight,
      couriers: input.couriers,
    })
    return { ...origin, services, degraded }
  }

  // ── 1 gudang → langsung pakai (0 panggilan ekstra).
  if (warehouses.length === 1) {
    const w = warehouses[0]
    const { services, degraded } = await calculateShippingCost({
      origin: w.originId,
      destination: input.destinationId,
      weight: input.weight,
      couriers: input.couriers,
    })
    return {
      warehouseId: w.id,
      originId: w.originId,
      name: w.name,
      cityName: w.cityName,
      provinceName: w.provinceName,
      services,
      degraded,
    }
  }

  // ── >1 gudang → prefilter region → cost-compare kandidat → termurah.
  const candidates = rankByProximity(
    warehouses,
    input.destCityName,
    input.destProvinceName,
  ).slice(0, MAX_CANDIDATES)

  const results = await Promise.all(
    candidates.map(async (w) => {
      const { services, degraded } = await calculateShippingCost({
        origin: w.originId,
        destination: input.destinationId,
        weight: input.weight,
        couriers: input.couriers,
      })
      return { w, services, degraded }
    }),
  )

  // Prioritas gudang yang punya opsi ongkir; kalau semua kosong (kuota habis),
  // tetap balikan kandidat pertama supaya caller bisa tampil "coba lagi".
  const viable = results.filter((r) => r.services.length > 0)
  const pool = viable.length > 0 ? viable : results
  let best = pool[0]
  let bestMin = minCost(best.services)
  for (const r of pool.slice(1)) {
    const m = minCost(r.services)
    if (m < bestMin) {
      best = r
      bestMin = m
    }
  }

  return {
    warehouseId: best.w.id,
    originId: best.w.originId,
    name: best.w.name,
    cityName: best.w.cityName,
    provinceName: best.w.provinceName,
    services: best.services,
    degraded: best.services.length === 0 ? true : best.degraded,
  }
}
