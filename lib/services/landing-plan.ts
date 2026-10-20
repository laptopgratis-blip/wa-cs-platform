// Paket termurah yang membuka Sistem Order — untuk teks harga di landing
// publik. Kriteria sama dengan yang membuat paket tampil & bisa dibeli di
// /pricing (isActive + priceMonthly > 0) ditambah flag canUseOrderSystem
// yang dipakai lib/order-system-gate.ts.
import type { OrderSystemPlan } from '@/lib/landing-plan'
import { prisma } from '@/lib/prisma'

export async function getOrderSystemStartingPlan(): Promise<OrderSystemPlan | null> {
  try {
    return await prisma.lpUpgradePackage.findFirst({
      where: {
        isActive: true,
        canUseOrderSystem: true,
        priceMonthly: { gt: 0 },
      },
      orderBy: { priceMonthly: 'asc' },
      select: { name: true, priceMonthly: true },
    })
  } catch (err) {
    // Landing tetap tampil tanpa angka harga (teks fallback) — jangan
    // jatuhkan halaman publik karena query pelengkap.
    console.error(
      '[landing-plan] gagal memuat paket Sistem Order termurah',
      err,
    )
    return null
  }
}
