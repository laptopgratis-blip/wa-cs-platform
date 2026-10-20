// Teks paket Sistem Order untuk landing publik (/, /cs-whatsapp). PURE —
// data diambil server lewat lib/services/landing-plan.ts. Nama & harga dari
// DB supaya landing tidak basi saat admin mengubah harga atau flag paket.
import { formatRupiah } from '@/lib/format'

export interface OrderSystemPlan {
  name: string
  priceMonthly: number
}

// Dipakai kalau tidak ada paket ber-Sistem Order yang dijual (atau DB gagal):
// jangan sebut nama paket yang belum tentu benar.
export const ORDER_SYSTEM_PLAN_FALLBACK = 'berbayar'

export function orderSystemPlanName(plan: OrderSystemPlan | null): string {
  return plan?.name ?? ORDER_SYSTEM_PLAN_FALLBACK
}

// "setara" karena langganan dibayar pakai saldo token (konversi di checkout).
export function orderSystemPriceText(
  plan: OrderSystemPlan | null,
): string | null {
  if (!plan || plan.priceMonthly <= 0) return null
  return `setara ${formatRupiah(plan.priceMonthly)}/bulan`
}
