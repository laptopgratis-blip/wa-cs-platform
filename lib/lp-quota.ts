// Helper kuota Landing Page Builder.
//
// Sejak 2026-07-14 tier kuota adalah TURUNAN dari subscription hidup
// (lib/services/subscription.ts: resolveLpEntitlement + syncQuotaFromSubscriptions).
// Mekanisme lama "tier naik dari akumulasi top-up token" sudah DIMATIKAN —
// akun era lama di-grandfather lewat kolom UserQuota.legacyTier.
// File ini menyimpan konstanta entitlement per tier + helper cek kuota.
import type { LpTier, Prisma, UserQuota } from '@prisma/client'

import { prisma } from '@/lib/prisma'

// Subset Prisma client yang fungsi-fungsi di file ini butuh — kompatibel
// dengan baik global `prisma` maupun `tx` dari $transaction(callback).
type Db = Prisma.TransactionClient | typeof prisma

interface TierConfig {
  tier: LpTier
  maxLp: number
  maxStorageMB: number
  // Cap pengunjung LP per bulan. Tier berbayar dinaikkan jauh dari default
  // FREE (1000) supaya LP yang ramai tidak kena placeholder "tidak tersedia".
  // POWER praktis unlimited (5jt).
  maxVisitorMonth: number
  // Cap ukuran per-gambar (MB) saat upload di LP builder — beda dengan
  // maxStorageMB (total). Angka ini juga dipakai backfill migration
  // 20260714_subscription_quota_sync; kalau diubah, sinkronkan.
  maxImageSizeMB: number
}

// Urutan dari kecil ke besar — dipakai sebagai default entitlement per tier.
const TIERS: TierConfig[] = [
  { tier: 'FREE', maxLp: 1, maxStorageMB: 5, maxVisitorMonth: 1_000, maxImageSizeMB: 1 },
  { tier: 'STARTER', maxLp: 3, maxStorageMB: 20, maxVisitorMonth: 20_000, maxImageSizeMB: 3 },
  { tier: 'POPULAR', maxLp: 10, maxStorageMB: 100, maxVisitorMonth: 100_000, maxImageSizeMB: 5 },
  { tier: 'POWER', maxLp: 999, maxStorageMB: 500, maxVisitorMonth: 5_000_000, maxImageSizeMB: 10 },
]

// Cap visitor per tier — sumber tunggal untuk UI /pricing supaya angka yang
// ditampilkan selalu sinkron dengan enforcement (jangan hardcode ulang di UI).
export const TIER_VISITOR_CAP = Object.fromEntries(
  TIERS.map((t) => [t.tier, t.maxVisitorMonth]),
) as Record<LpTier, number>

// Cap ukuran per-gambar (MB) per tier — mirror TIER_VISITOR_CAP.
export const TIER_IMAGE_CAP = Object.fromEntries(
  TIERS.map((t) => [t.tier, t.maxImageSizeMB]),
) as Record<LpTier, number>

// Entitlement lengkap per tier — dipakai syncQuotaFromSubscriptions sebagai
// nilai default saat tier menang tanpa paket (mis. legacyTier) dan untuk
// kolom yang tidak ada di LpUpgradePackage (visitor & image cap).
export const TIER_ENTITLEMENTS = Object.fromEntries(
  TIERS.map((t) => [
    t.tier,
    {
      maxLp: t.maxLp,
      maxStorageMB: t.maxStorageMB,
      maxVisitorMonth: t.maxVisitorMonth,
      maxImageSizeMB: t.maxImageSizeMB,
    },
  ]),
) as Record<
  LpTier,
  {
    maxLp: number
    maxStorageMB: number
    maxVisitorMonth: number
    maxImageSizeMB: number
  }
>

const RANK: Record<LpTier, number> = {
  FREE: 0,
  STARTER: 1,
  POPULAR: 2,
  POWER: 3,
}

// Ambil quota user; auto-create dengan default FREE kalau belum ada.
// `db` opsional: kalau dipanggil di dalam $transaction, lewatkan `tx` supaya
// read+create-nya ikut dalam transaksi.
export async function getUserQuota(
  userId: string,
  db: Db = prisma,
): Promise<UserQuota> {
  const existing = await db.userQuota.findUnique({ where: { userId } })
  if (existing) return existing
  return db.userQuota.create({
    data: { userId, tier: 'FREE', maxLp: 1, maxStorageMB: 5 },
  })
}

interface QuotaCheckResult {
  ok: boolean
  reason?: string
  quota: UserQuota
  current?: number
}

// Cek apakah user masih bisa buat LP baru (jumlah LP < maxLp).
export async function checkLpQuota(userId: string): Promise<QuotaCheckResult> {
  const quota = await getUserQuota(userId)
  const current = await prisma.landingPage.count({ where: { userId } })
  if (current >= quota.maxLp) {
    return {
      ok: false,
      reason: `Kuota LP sudah penuh (${current}/${quota.maxLp}). Upgrade paket untuk menambah kuota.`,
      quota,
      current,
    }
  }
  return { ok: true, quota, current }
}

// Cek apakah masih ada storage untuk file baru.
// fileSizeMB pakai pecahan (mis. 1.5 MB) — kita simpan storageUsedMB juga sebagai Float.
export async function checkStorageQuota(
  userId: string,
  fileSizeMB: number,
): Promise<QuotaCheckResult> {
  const quota = await getUserQuota(userId)
  const projected = quota.storageUsedMB + fileSizeMB
  if (projected > quota.maxStorageMB) {
    return {
      ok: false,
      reason: `Storage tidak cukup (${quota.storageUsedMB.toFixed(2)} MB dari ${quota.maxStorageMB} MB terpakai). Upgrade paket atau hapus gambar lama.`,
      quota,
    }
  }
  return { ok: true, quota }
}

// Tambah atau kurangi storage usage. Floor ke 0 supaya tidak negatif.
export async function updateStorageUsed(
  userId: string,
  deltaMB: number,
): Promise<UserQuota> {
  const quota = await getUserQuota(userId)
  const next = Math.max(0, quota.storageUsedMB + deltaMB)
  return prisma.userQuota.update({
    where: { userId },
    data: { storageUsedMB: next },
  })
}

// Apply tier dari paket LP yang dibeli user (Payment LP_UPGRADE konfirm /
// ManualPayment LP_UPGRADE konfirm). Hanya naik — kalau user sudah di tier
// lebih tinggi, biarkan (tetap return quota current).
//
// LEGACY (era pra-subscription): jalur pembelian one-time ini sudah tidak
// punya UI (tidak ada yang memanggil /api/lp/upgrade/create dari frontend) —
// dipertahankan hanya untuk payment lama yang masih pending. Tier yang
// ditulis di sini bisa ditimpa syncQuotaFromSubscriptions pada event
// subscription berikutnya kecuali akun tsb punya legacyTier.
export async function applyLpUpgradeFromPackage(
  userId: string,
  pkg: { tier: LpTier; maxLp: number; maxStorageMB: number },
): Promise<UserQuota> {
  const current = await getUserQuota(userId)
  if (RANK[pkg.tier] <= RANK[current.tier]) {
    // User sudah di tier yang sama atau lebih tinggi — no-op (idempotent).
    return current
  }
  return prisma.userQuota.update({
    where: { userId },
    data: {
      tier: pkg.tier,
      // Quota baru harus minimal sama besar dengan current (defensive: tidak
      // pernah turunkan kuota walaupun paket baru kebetulan lebih kecil).
      maxLp: Math.max(current.maxLp, pkg.maxLp),
      maxStorageMB: Math.max(current.maxStorageMB, pkg.maxStorageMB),
    },
  })
}
