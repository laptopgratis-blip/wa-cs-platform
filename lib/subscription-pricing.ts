// Konfigurasi harga subscription LP — dipakai bersama oleh /pricing UI,
// /upgrade checkout, /api/subscription/checkout, dan tampilan invoice.
//
// Diskon untuk durasi panjang: 0% (1bln) / 10% (3bln) / 15% (6bln) / 20% (1thn).
// Single source of truth supaya UI dan backend tidak drift.

export interface DurationDiscount {
  months: number
  discountPct: number
  label: string
  badge?: string
  popular?: boolean
}

export const DURATION_DISCOUNTS: DurationDiscount[] = [
  { months: 1, discountPct: 0, label: '1 Bulan' },
  { months: 3, discountPct: 10, label: '3 Bulan', badge: 'Hemat 10%' },
  { months: 6, discountPct: 15, label: '6 Bulan', badge: 'Hemat 15%' },
  { months: 12, discountPct: 20, label: '1 Tahun', badge: 'Hemat 20%', popular: true },
]

export const VALID_DURATIONS = DURATION_DISCOUNTS.map((d) => d.months)

export interface PriceCalculation {
  durationMonths: number
  discountPct: number
  priceBase: number      // priceMonthly × durationMonths (sebelum diskon)
  discountAmount: number
  priceFinal: number     // dibulatkan ke seratus rupiah terdekat
}

export function calculateSubscriptionPrice(
  priceMonthly: number,
  durationMonths: number,
): PriceCalculation {
  const config = DURATION_DISCOUNTS.find((d) => d.months === durationMonths)
  if (!config) {
    throw new Error(
      `Durasi ${durationMonths} bulan tidak valid. Pilih: ${VALID_DURATIONS.join(', ')}`,
    )
  }
  if (!Number.isFinite(priceMonthly) || priceMonthly <= 0) {
    throw new Error('priceMonthly harus angka positif')
  }
  const priceBase = priceMonthly * durationMonths
  const discountAmount = Math.round((priceBase * config.discountPct) / 100)
  // Bulatkan final ke ratusan rupiah terdekat (UX: nominal 'cantik').
  const priceFinal = Math.round((priceBase - discountAmount) / 100) * 100
  return {
    durationMonths,
    discountPct: config.discountPct,
    priceBase,
    discountAmount,
    priceFinal,
  }
}

// Format invoice number: HLO-SUB-YYYYMMDD-XXXXXX (last 6 chars random base36).
// Unique constraint di DB, jadi bentrok extremely unlikely tapi tidak fatal —
// kalau bentrok, retry akan generate baru.
export function generateInvoiceNumber(): string {
  const date = new Date()
  const yyyymmdd =
    String(date.getFullYear()) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `HLO-SUB-${yyyymmdd}-${random}`
}

// Untuk manual transfer: tambah random 100-999 di akhir nominal supaya
// admin/finance gampang identify pemilik transfer dari mutasi rekening.
// Contoh: priceFinal=135000 + uniqueCode=247 → totalAmount=135247.
export function generateUniqueCode(): number {
  return 100 + Math.floor(Math.random() * 900)
}
