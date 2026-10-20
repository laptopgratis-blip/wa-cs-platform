// Entitlement tiap paket LP untuk ditampilkan di /pricing — dihitung dari
// sumber yang SAMA dengan enforcement, supaya kartu tidak pernah menjanjikan
// lebih dari yang benar-benar dibuka:
//   - kuota LP/storage/visitor/gambar → resolveLpEntitlement (lp-quota)
//   - Sistem Order → flag DB LpUpgradePackage.canUseOrderSystem
//   - limit form order → resolveOrderFormLimit
//   - Host AI → hostTierAllowed
//   - LP Lab → lpLabTierAllowed
import type { LpTier } from '@prisma/client'

import { hostTierAllowed } from '@/lib/host-gen-gate'
import type { PlanEntitlement } from '@/lib/plan-features'
import { resolveLpEntitlement } from '@/lib/services/subscription'
import { resolveOrderFormLimit } from '@/lib/validations/order-form'

// LP Lab dikunci dengan cek literal `tier !== 'POWER'` di route
// app/api/lp/[lpId]/{analytics,heatmap,score,signals,optimize,...} dan di
// LpLabClient. Kalau aturan di sana berubah, ubah juga di sini.
export function lpLabTierAllowed(tier: string): boolean {
  return tier === 'POWER'
}

interface PackageInput {
  tier: LpTier
  maxLp: number
  maxStorageMB: number
  canUseOrderSystem: boolean
}

// Tanggal acuan statis — resolver hanya butuh `now` untuk menyaring sub
// hidup, dan sub simulasi di bawah selalu lifetime.
const REF_DATE = new Date(0)

// Simulasikan "user dengan langganan hidup paket ini" lalu jalankan resolver
// yang sama dengan syncQuotaFromSubscriptions.
export function planEntitlementForPackage(pkg: PackageInput): PlanEntitlement {
  const quota = resolveLpEntitlement(
    [
      {
        status: 'ACTIVE',
        isLifetime: true,
        endDate: REF_DATE,
        tier: pkg.tier,
        maxLp: pkg.maxLp,
        maxStorageMB: pkg.maxStorageMB,
      },
    ],
    REF_DATE,
  )
  return {
    maxLp: quota.maxLp,
    maxStorageMB: quota.maxStorageMB,
    maxImageSizeMB: quota.maxImageSizeMB,
    maxVisitorMonth: quota.maxVisitorMonth,
    orderSystem: pkg.canUseOrderSystem,
    orderFormLimit: resolveOrderFormLimit(quota.tier),
    hostAi: hostTierAllowed(quota.tier),
    lpLab: lpLabTierAllowed(quota.tier),
  }
}

// FREE tidak punya baris paket — tanpa langganan hidup.
export function freePlanEntitlement(): PlanEntitlement {
  const quota = resolveLpEntitlement([], REF_DATE)
  return {
    maxLp: quota.maxLp,
    maxStorageMB: quota.maxStorageMB,
    maxImageSizeMB: quota.maxImageSizeMB,
    maxVisitorMonth: quota.maxVisitorMonth,
    // Order System & Host AI butuh langganan hidup — FREE tidak punya.
    orderSystem: false,
    orderFormLimit: resolveOrderFormLimit(quota.tier),
    hostAi: false,
    lpLab: lpLabTierAllowed(quota.tier),
  }
}
