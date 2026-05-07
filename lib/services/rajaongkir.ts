// Integrasi RajaOngkir Komerce (Starter tier — 500 hit/hari).
// API key disimpan di env, JANGAN expose ke client. Semua call via proxy
// route /api/shipping/* untuk plan-gating + caching.
//
// Endpoint Komerce (per Mei 2026):
//   GET  /api/v1/destination/domestic-destination?search=&limit=&offset=
//   POST /api/v1/calculate/domestic-cost (body: form-urlencoded)
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

export async function searchDestinations(
  query: string,
  limit = 10,
  offset = 0,
): Promise<RajaongkirDestination[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const url = new URL(`${RAJAONGKIR_BASE}/destination/domestic-destination`)
  url.searchParams.set('search', trimmed)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))

  const res = await fetch(url.toString(), {
    headers: { key: getApiKey() },
    // Cache di Next fetch supaya pencarian populer tidak bombard Komerce.
    next: { revalidate: 60 * 60 * 24 },  // 24 jam
  })

  if (!res.ok) {
    console.error('[rajaongkir] searchDestinations failed:', res.status)
    return []
  }
  const json = await res.json()
  if (json?.meta?.code !== 200 || !Array.isArray(json.data)) {
    console.error('[rajaongkir] searchDestinations bad payload:', json?.meta)
    return []
  }
  return json.data as RajaongkirDestination[]
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

interface CostParams {
  origin: number  // destination ID asal
  destination: number  // destination ID tujuan
  weight: number  // dalam gram
  couriers: string[]  // ['jne', 'sicepat', 'jnt', 'anteraja']
}

export async function calculateShippingCost(
  params: CostParams,
): Promise<ShippingService[]> {
  if (params.couriers.length === 0) return []

  const sortedCouriers = [...params.couriers].sort()
  const cacheKey = `${params.origin}:${params.destination}:${params.weight}:${sortedCouriers.join(',')}`

  // Cek cache 6 jam.
  const cached = await prisma.shippingCostCache.findUnique({
    where: { cacheKey },
  })
  if (cached && cached.expiresAt > new Date()) {
    return cached.responseJson as unknown as ShippingService[]
  }

  // Hit Komerce.
  const body = new URLSearchParams({
    origin: String(params.origin),
    destination: String(params.destination),
    weight: String(params.weight),
    courier: sortedCouriers.join(':'),
    price: 'lowest',
  })

  const res = await fetch(`${RAJAONGKIR_BASE}/calculate/domestic-cost`, {
    method: 'POST',
    headers: {
      key: getApiKey(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!res.ok) {
    console.error('[rajaongkir] calculateShippingCost failed:', res.status)
    // Kalau ada cache lama (expired), pakai sebagai fallback supaya UI tidak
    // crash saat Komerce down sesaat.
    if (cached) return cached.responseJson as unknown as ShippingService[]
    return []
  }

  const json = await res.json()
  if (json?.meta?.code !== 200 || !Array.isArray(json.data)) {
    console.error('[rajaongkir] cost bad payload:', json?.meta)
    if (cached) return cached.responseJson as unknown as ShippingService[]
    return []
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

  return services
}

// Daftar kurir yang didukung. Dipakai untuk populate UI checkbox.
export const SUPPORTED_COURIERS = [
  { code: 'jne', name: 'JNE' },
  { code: 'sicepat', name: 'SiCepat' },
  { code: 'jnt', name: 'J&T' },
  { code: 'anteraja', name: 'AnterAja' },
] as const

export type CourierCode = (typeof SUPPORTED_COURIERS)[number]['code']
