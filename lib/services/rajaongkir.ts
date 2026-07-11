// Integrasi RajaOngkir Komerce (Starter tier — 500 hit/hari).
// API key disimpan di env, JANGAN expose ke client. Semua call via proxy
// route /api/shipping/* untuk plan-gating + caching.
//
// Strategi hemat kuota (incident jebol 2026-06-10 & 2026-07-10):
// 1. Exact-query cache 30 hari (ShippingDestinationCache) — persisten.
// 2. Master destinasi lokal (ShippingDestination) — terisi dari tiap hasil
//    upstream + backfill migration. Query yang sudah ter-cover lokal
//    (>= limit hasil) TIDAK hit upstream sama sekali.
// 3. Circuit breaker: begitu upstream balas 429 (kuota habis), semua call
//    5 menit berikutnya langsung pakai lokal/stale cache — jangan hammer.
// 4. Flag `degraded` di return: true = hasil kosong KARENA upstream gagal
//    (bukan karena memang tidak ada) → UI bisa jujur "layanan sibuk".
//
// Endpoint Komerce (per Mei 2026):
//   GET  /api/v1/destination/domestic-destination?search=&limit=&offset=
//   POST /api/v1/calculate/domestic-cost (body: form-urlencoded)
import type { Prisma, ShippingDestination } from '@prisma/client'

import { prisma } from '@/lib/prisma'

const RAJAONGKIR_BASE = 'https://rajaongkir.komerce.id/api/v1'
const SHIPPING_CACHE_TTL_MS = 6 * 60 * 60 * 1000  // 6 jam

function getApiKey(): string {
  const key = process.env.RAJAONGKIR_API_KEY
  if (!key) {
    throw new Error('RAJAONGKIR_API_KEY belum diset di environment')
  }
  return key
}

// ─── CIRCUIT BREAKER ───────────────────────────────────────────────────
// Setelah 429, stop hit upstream sebentar — kemarin ada 567 call yang semuanya
// pasti gagal tapi tetap dikirim. In-memory per container (single-VPS: cukup).
const UPSTREAM_BREAKER_MS = 5 * 60_000
let upstreamBlockedUntil = 0

function isUpstreamBlocked(): boolean {
  return Date.now() < upstreamBlockedUntil
}

function tripUpstreamBreaker(): void {
  upstreamBlockedUntil = Date.now() + UPSTREAM_BREAKER_MS
  console.warn(
    '[rajaongkir] kuota harian habis (429) — skip upstream 5 menit ke depan',
  )
}

// ─── DESTINATIONS ──────────────────────────────────────────────────────
// Search destination by free-text. Komerce return level subdistrict +
// auto-include parent (district, city, province, zip).
export interface RajaongkirDestination {
  id: number
  label: string
  province_name: string
  city_name: string
  district_name: string
  subdistrict_name: string
  zip_code: string
}

export interface DestinationSearchResult {
  items: RajaongkirDestination[]
  // true = items kosong karena upstream gagal/kuota habis, bukan karena
  // memang tidak ada hasil. UI harus tampilkan "coba lagi", bukan
  // "tidak ditemukan".
  degraded: boolean
}

// TTL cache search destinasi: data wilayah (kecamatan/kelurahan/zip) sangat
// jarang berubah. Cache DB persisten lintas deploy — Next fetch-cache TIDAK
// cukup karena hangus tiap build image (incident kuota jebol 2026-06-10).
const DEST_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari

// Format HARUS sama dengan backfill SQL di migration
// 20260711040000_shipping_destination_master: lowercase
// "subdistrict district city province zip", subdistrict "-" di-skip.
function buildDestinationSearchText(d: RajaongkirDestination): string {
  return [
    d.subdistrict_name && d.subdistrict_name !== '-'
      ? d.subdistrict_name
      : null,
    d.district_name,
    d.city_name,
    d.province_name,
    d.zip_code,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .trim()
}

function toDestinationShape(row: ShippingDestination): RajaongkirDestination {
  return {
    id: row.id,
    label: row.label,
    province_name: row.provinceName,
    city_name: row.cityName,
    district_name: row.districtName,
    subdistrict_name: row.subdistrictName,
    zip_code: row.zipCode,
  }
}

// Contains-search di master lokal. Ranking sederhana: match yang posisinya
// lebih awal di searchText lebih relevan (nama kelurahan/kecamatan duluan).
async function searchLocalDestinations(
  qLower: string,
  limit: number,
): Promise<RajaongkirDestination[]> {
  const rows = await prisma.shippingDestination
    .findMany({
      where: { searchText: { contains: qLower } },
      take: limit * 3,
    })
    .catch(() => [] as ShippingDestination[])
  return [...rows]
    .sort(
      (a, b) =>
        a.searchText.indexOf(qLower) - b.searchText.indexOf(qLower) ||
        a.searchText.localeCompare(b.searchText),
    )
    .slice(0, limit)
    .map(toDestinationShape)
}

// Simpan hasil upstream ke master lokal. Duplikat id di-skip (data wilayah
// statis — tidak perlu update).
async function seedLocalDestinations(
  items: RajaongkirDestination[],
): Promise<void> {
  if (items.length === 0) return
  await prisma.shippingDestination
    .createMany({
      data: items.map((d) => ({
        id: d.id,
        label: d.label ?? '',
        provinceName: d.province_name ?? '',
        cityName: d.city_name ?? '',
        districtName: d.district_name ?? '',
        subdistrictName: d.subdistrict_name ?? '',
        zipCode: d.zip_code ?? '',
        searchText: buildDestinationSearchText(d),
      })),
      skipDuplicates: true,
    })
    .catch(() => {})
}

// Hit upstream Komerce. Return null = gagal (kuota/network/payload aneh) —
// 404 dianggap hasil kosong yang sah (bukan error sistem).
async function fetchUpstreamDestinations(
  query: string,
  limit: number,
  offset: number,
): Promise<RajaongkirDestination[] | null> {
  const url = new URL(`${RAJAONGKIR_BASE}/destination/domestic-destination`)
  url.searchParams.set('search', query)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))

  try {
    const res = await fetch(url.toString(), { headers: { key: getApiKey() } })
    if (res.ok) {
      const json = await res.json()
      if (json?.meta?.code === 200 && Array.isArray(json.data)) {
        return json.data as RajaongkirDestination[]
      }
      console.error('[rajaongkir] searchDestinations bad payload:', json?.meta)
      return null
    }
    if (res.status === 404) return []
    if (res.status === 429) tripUpstreamBreaker()
    console.error('[rajaongkir] searchDestinations failed:', res.status)
    return null
  } catch (err) {
    console.error('[rajaongkir] searchDestinations error:', err)
    return null
  }
}

export async function searchDestinations(
  query: string,
  limit = 10,
  offset = 0,
): Promise<DestinationSearchResult> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return { items: [], degraded: false }

  const qLower = trimmed.toLowerCase()
  const cacheKey = `${qLower}:${limit}:${offset}`

  // 1. Exact-query cache (termasuk negative cache hasil kosong).
  const cached = await prisma.shippingDestinationCache
    .findUnique({ where: { query: cacheKey } })
    .catch(() => null)
  if (cached && Date.now() - cached.updatedAt.getTime() < DEST_CACHE_TTL_MS) {
    return {
      items: cached.payload as unknown as RajaongkirDestination[],
      degraded: false,
    }
  }

  // 2. Master lokal. Kalau cakupan sudah penuh (>= limit) tidak perlu
  //    upstream sama sekali — nol kuota.
  const local = await searchLocalDestinations(qLower, limit)
  if (local.length >= limit) return { items: local, degraded: false }

  // 3. Breaker aktif (kuota habis barusan) → jangan hammer upstream.
  if (isUpstreamBlocked()) {
    if (local.length > 0) return { items: local, degraded: false }
    if (cached) {
      return {
        items: cached.payload as unknown as RajaongkirDestination[],
        degraded: false,
      }
    }
    return { items: [], degraded: true }
  }

  // 4. Upstream.
  const upstream = await fetchUpstreamDestinations(trimmed, limit, offset)
  if (upstream !== null) {
    if (upstream.length > 0) {
      const payload = upstream as unknown as Prisma.InputJsonValue
      await prisma.shippingDestinationCache
        .upsert({
          where: { query: cacheKey },
          create: { query: cacheKey, payload },
          update: { payload },
        })
        .catch(() => {})
      await seedLocalDestinations(upstream)
      return { items: upstream, degraded: false }
    }
    // Upstream sah bilang kosong (404). Kalau lokal punya partial match,
    // pakai itu (matching upstream beda semantik) & JANGAN negative-cache.
    if (local.length > 0) return { items: local, degraded: false }
    await prisma.shippingDestinationCache
      .upsert({
        where: { query: cacheKey },
        create: { query: cacheKey, payload: [] },
        update: { payload: [] },
      })
      .catch(() => {})
    return { items: [], degraded: false }
  }

  // 5. Upstream gagal — stale cache umur berapa pun > lokal partial > kosong.
  if (cached) {
    return {
      items: cached.payload as unknown as RajaongkirDestination[],
      degraded: false,
    }
  }
  if (local.length > 0) return { items: local, degraded: false }
  return { items: [], degraded: true }
}

// ─── SHIPPING COST ─────────────────────────────────────────────────────
export interface ShippingService {
  name: string         // "Jalur Nugraha Ekakurir (JNE)"
  code: string         // "jne"
  service: string      // "REG", "CTC", dll
  description: string  // "Reguler"
  cost: number
  etd: string          // "1 day", "2-3 day"
}

export interface ShippingCostResult {
  services: ShippingService[]
  // true = services kosong karena upstream gagal/kuota habis — UI harus
  // tampilkan "coba lagi", bukan "tidak ada opsi ongkir".
  degraded: boolean
}

interface CostParams {
  origin: number  // destination ID asal
  destination: number  // destination ID tujuan
  weight: number  // dalam gram
  couriers: string[]  // ['jne', 'sicepat', 'jnt', 'anteraja']
}

export async function calculateShippingCost(
  params: CostParams,
): Promise<ShippingCostResult> {
  if (params.couriers.length === 0) return { services: [], degraded: false }

  const sortedCouriers = [...params.couriers].sort()
  const cacheKey = `${params.origin}:${params.destination}:${params.weight}:${sortedCouriers.join(',')}`

  // Cek cache 6 jam.
  const cached = await prisma.shippingCostCache.findUnique({
    where: { cacheKey },
  })
  if (cached && cached.expiresAt > new Date()) {
    return {
      services: cached.responseJson as unknown as ShippingService[],
      degraded: false,
    }
  }

  // Breaker aktif → langsung stale cache tanpa hit upstream.
  if (isUpstreamBlocked()) {
    if (cached) {
      return {
        services: cached.responseJson as unknown as ShippingService[],
        degraded: false,
      }
    }
    return { services: [], degraded: true }
  }

  // Hit Komerce.
  const body = new URLSearchParams({
    origin: String(params.origin),
    destination: String(params.destination),
    weight: String(params.weight),
    courier: sortedCouriers.join(':'),
    price: 'lowest',
  })

  let res: Response
  try {
    res = await fetch(`${RAJAONGKIR_BASE}/calculate/domestic-cost`, {
      method: 'POST',
      headers: {
        key: getApiKey(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
  } catch (err) {
    console.error('[rajaongkir] calculateShippingCost error:', err)
    if (cached) {
      return {
        services: cached.responseJson as unknown as ShippingService[],
        degraded: false,
      }
    }
    return { services: [], degraded: true }
  }

  if (!res.ok) {
    if (res.status === 429) tripUpstreamBreaker()
    console.error('[rajaongkir] calculateShippingCost failed:', res.status)
    // Kalau ada cache lama (expired), pakai sebagai fallback supaya UI tidak
    // crash saat Komerce down sesaat.
    if (cached) {
      return {
        services: cached.responseJson as unknown as ShippingService[],
        degraded: false,
      }
    }
    return { services: [], degraded: true }
  }

  const json = await res.json()
  if (json?.meta?.code !== 200 || !Array.isArray(json.data)) {
    console.error('[rajaongkir] cost bad payload:', json?.meta)
    if (cached) {
      return {
        services: cached.responseJson as unknown as ShippingService[],
        degraded: false,
      }
    }
    return { services: [], degraded: true }
  }

  const services = json.data as ShippingService[]

  // Save / update cache.
  const expiresAt = new Date(Date.now() + SHIPPING_CACHE_TTL_MS)
  await prisma.shippingCostCache
    .upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        responseJson: services as never,
        expiresAt,
      },
      update: {
        responseJson: services as never,
        expiresAt,
      },
    })
    .catch((err) => {
      // Cache write failure tidak fatal — log saja, return tetap jalan.
      console.error('[rajaongkir] cache upsert failed:', err)
    })

  return { services, degraded: false }
}

// Daftar kurir yang didukung. Dipakai untuk populate UI checkbox.
export const SUPPORTED_COURIERS = [
  { code: 'jne', name: 'JNE' },
  { code: 'sicepat', name: 'SiCepat' },
  { code: 'jnt', name: 'J&T' },
  { code: 'anteraja', name: 'AnterAja' },
] as const

export type CourierCode = (typeof SUPPORTED_COURIERS)[number]['code']
