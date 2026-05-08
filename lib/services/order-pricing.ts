// Pricing engine untuk Order System (Phase 3, 2026-05-07).
// Merangkai: subtotal produk + flash sale discount + ongkir RajaOngkir + zone
// subsidy (kalau ada) → total final.
//
// Dipanggil dari:
//   - GET-side preview live di public form order (saat customer pilih kurir)
//   - POST /api/orders/submit saat finalisasi order (sumber kebenaran total)
import type { Product } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { calculateShippingCost } from '@/lib/services/rajaongkir'

export interface PricingItemSnapshot {
  productId: string
  // Phase 5 (2026-05-08): kalau produk punya varian, customer wajib kirim
  // variantId. Snapshot ini di-store di UserOrder.items (JSON), juga jadi
  // sumber data invoice/follow-up — sengaja denormalized supaya tetap valid
  // walau varian dihapus belakangan.
  variantId: string | null
  variantName: string | null
  name: string
  price: number          // harga efektif (flash sale kalau aktif, varian kalau ada)
  originalPrice: number  // harga normal sebelum flash sale
  qty: number
  weight: number         // weight per unit (gram)
  isFlashSale: boolean
}

export interface PricingResult {
  items: PricingItemSnapshot[]
  totalWeight: number
  subtotal: number
  flashSaleDiscount: number
  shippingCost: number
  shippingSubsidy: number
  finalShipping: number
  shippingCourier: string | null
  shippingService: string | null
  shippingEtd: string | null
  shippingDescription: string | null
  total: number
  appliedZoneId: string | null
  appliedZoneName: string | null
  appliedZoneDescription: string | null
}

interface CalculateInput {
  userId: string
  items: Array<{ productId: string; variantId?: string | null; qty: number }>
  shippingDestinationId?: number
  shippingProvinceName?: string | null
  shippingCityName?: string | null
  selectedCourier?: string  // 'jne' | 'sicepat' | 'jnt' | 'anteraja'
  selectedService?: string  // 'REG' | 'CTC' | dll — match field `service` di RajaOngkir
  paymentMethod: 'COD' | 'TRANSFER'
  // Untuk COD, kalau OrderForm.shippingFlatCod ≠ null kita pakai itu
  // (skip RajaOngkir).
  flatCodCost?: number | null
}

export function isFlashSaleActive(product: Product): boolean {
  if (!product.flashSaleActive) return false
  if (
    product.flashSalePrice == null ||
    !product.flashSaleStartAt ||
    !product.flashSaleEndAt
  ) {
    return false
  }
  const now = new Date()
  if (now < product.flashSaleStartAt || now > product.flashSaleEndAt)
    return false
  if (
    product.flashSaleQuota != null &&
    product.flashSaleSold >= product.flashSaleQuota
  ) {
    return false
  }
  return true
}

interface MatchZoneInput {
  userId: string
  cityName?: string | null
  provinceName?: string | null
}

// Cari zona ongkir match dengan priority tertinggi. Match-nya by NAME (city
// atau province) — bukan ID Komerce, karena ID destination Komerce di
// subdistrict-level dan zona dibuat user pakai name.
export async function findMatchingZone(input: MatchZoneInput) {
  const zones = await prisma.shippingZone.findMany({
    where: { userId: input.userId, isActive: true },
    orderBy: { priority: 'desc' },
  })
  const now = new Date()
  for (const z of zones) {
    if (z.startsAt && z.startsAt > now) continue
    if (z.endsAt && z.endsAt < now) continue
    if (z.matchType === 'ALL') return z
    if (
      z.matchType === 'CITY' &&
      input.cityName &&
      z.cityNames.some(
        (n) => n.toLowerCase() === input.cityName!.toLowerCase(),
      )
    ) {
      return z
    }
    if (
      z.matchType === 'PROVINCE' &&
      input.provinceName &&
      z.provinceNames.some(
        (n) => n.toLowerCase() === input.provinceName!.toLowerCase(),
      )
    ) {
      return z
    }
  }
  return null
}

function describeZone(z: {
  subsidyType: string
  subsidyValue: number
  minimumOrder: number | null
}): string {
  if (z.subsidyType === 'FREE') {
    return z.minimumOrder
      ? `Gratis ongkir min order Rp ${z.minimumOrder.toLocaleString('id-ID')}`
      : 'Gratis ongkir'
  }
  if (z.subsidyType === 'FLAT_AMOUNT') {
    return `Subsidi Rp ${z.subsidyValue.toLocaleString('id-ID')}`
  }
  if (z.subsidyType === 'PERCENT') {
    return `Subsidi ${z.subsidyValue}%`
  }
  return ''
}

export async function calculateOrderTotal(
  input: CalculateInput,
): Promise<PricingResult> {
  // 1. Ambil produk + varian aktif sekaligus.
  const products = await prisma.product.findMany({
    where: {
      id: { in: input.items.map((i) => i.productId) },
      userId: input.userId,
    },
    include: {
      variants: { where: { isActive: true } },
    },
  })

  const itemsSnapshot: PricingItemSnapshot[] = []
  let subtotal = 0
  let flashSaleDiscount = 0
  let totalWeight = 0

  for (const item of input.items) {
    const product = products.find((p) => p.id === item.productId)
    if (!product) continue
    if (!product.isActive) continue

    // Phase 5: kalau produk punya varian, customer WAJIB pilih varian.
    // Skip item kalau variantId tidak match — defensive: server tidak boleh
    // tag-along ke harga produk default kalau ada varian (bisa salah harga).
    const hasVariants = product.variants.length > 0
    let variant = null as (typeof product.variants)[number] | null
    if (hasVariants) {
      if (!item.variantId) continue
      variant = product.variants.find((v) => v.id === item.variantId) ?? null
      if (!variant) continue
    }

    // Flash sale dihitung relative ke harga PRODUK (bukan varian) supaya
    // discount berlaku global per produk. Untuk varian: pakai harga varian
    // langsung (flash sale tidak di-apply per-varian dulu di Phase 5).
    const flash = !variant && isFlashSaleActive(product)
    const basePrice = variant ? variant.price : product.price
    const effective =
      flash && product.flashSalePrice != null
        ? product.flashSalePrice
        : basePrice
    const weight = variant ? variant.weightGrams : product.weightGrams

    subtotal += effective * item.qty
    if (flash && product.flashSalePrice != null) {
      flashSaleDiscount += (product.price - product.flashSalePrice) * item.qty
    }
    totalWeight += weight * item.qty

    itemsSnapshot.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      // Display name di invoice/notif: gabung "Produk – Varian".
      name: variant ? `${product.name} – ${variant.name}` : product.name,
      price: effective,
      originalPrice: basePrice,
      qty: item.qty,
      weight,
      isFlashSale: flash,
    })
  }

  // 2. Hitung ongkir.
  let shippingCost = 0
  let shippingCourier: string | null = null
  let shippingService: string | null = null
  let shippingEtd: string | null = null
  let shippingDescription: string | null = null

  if (input.paymentMethod === 'COD' && input.flatCodCost != null) {
    // COD pakai flat rate.
    shippingCost = input.flatCodCost
    shippingCourier = 'COD'
  } else if (
    input.shippingDestinationId &&
    input.selectedCourier &&
    input.selectedService
  ) {
    // Pakai RajaOngkir. Origin dari UserShippingProfile.
    const profile = await prisma.userShippingProfile.findUnique({
      where: { userId: input.userId },
    })
    if (profile?.originCityId) {
      const services = await calculateShippingCost({
        origin: Number(profile.originCityId),
        destination: input.shippingDestinationId,
        weight: Math.max(totalWeight, profile.defaultWeightGrams),
        couriers: [input.selectedCourier],
      })
      const match = services.find(
        (s) => s.code === input.selectedCourier && s.service === input.selectedService,
      )
      if (match) {
        shippingCost = match.cost
        shippingCourier = match.code
        shippingService = match.service
        shippingEtd = match.etd
        shippingDescription = match.description
      }
    }
  }

  // 3. Apply zone subsidy. Berdasar nama kota/provinsi tujuan.
  let shippingSubsidy = 0
  let appliedZoneId: string | null = null
  let appliedZoneName: string | null = null
  let appliedZoneDescription: string | null = null

  const zone = await findMatchingZone({
    userId: input.userId,
    cityName: input.shippingCityName,
    provinceName: input.shippingProvinceName,
  })
  if (
    zone &&
    shippingCost > 0 &&
    subtotal >= (zone.minimumOrder ?? 0)
  ) {
    if (zone.subsidyType === 'FREE') {
      shippingSubsidy = shippingCost
    } else if (zone.subsidyType === 'FLAT_AMOUNT') {
      shippingSubsidy = Math.min(zone.subsidyValue, shippingCost)
    } else if (zone.subsidyType === 'PERCENT') {
      shippingSubsidy = Math.round((shippingCost * zone.subsidyValue) / 100)
    }
    appliedZoneId = zone.id
    appliedZoneName = zone.name
    appliedZoneDescription = describeZone(zone)
  }

  const finalShipping = Math.max(0, shippingCost - shippingSubsidy)
  const total = subtotal + finalShipping

  return {
    items: itemsSnapshot,
    totalWeight,
    subtotal,
    flashSaleDiscount,
    shippingCost,
    shippingSubsidy,
    finalShipping,
    shippingCourier,
    shippingService,
    shippingEtd,
    shippingDescription,
    total,
    appliedZoneId,
    appliedZoneName,
    appliedZoneDescription,
  }
}
