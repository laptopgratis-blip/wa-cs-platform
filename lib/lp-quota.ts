// Helper kuota Landing Page Builder.
//
// Tier kuota dipetakan dari total token yang user beli (akumulasi seumur hidup).
// Hanya naik — tidak pernah turun, walaupun saldo token sudah habis.
import type { LpTier, Prisma, UserQuota } from '@prisma/client'

import { prisma } from '@/lib/prisma'

// Subset Prisma client yang fungsi-fungsi di file ini butuh — kompatibel
// dengan baik global `prisma` maupun `tx` dari $transaction(callback).
type Db = Prisma.TransactionClient | typeof prisma

interface TierConfig {
  tier: LpTier
  maxLp: number
  maxStorageMB: number
  // Threshold token (akumulasi total purchased) untuk naik ke tier ini.
  threshold: number
}

// Urutan dari kecil ke besar — penting untuk scan saat upgrade.
const TIERS: TierConfig[] = [
  { tier: 'FREE', maxLp: 1, maxStorageMB: 5, threshold: 0 },
  { tier: 'STARTER', maxLp: 3, maxStorageMB: 20, threshold: 10_000 },
  { tier: 'POPULAR', maxLp: 10, maxStorageMB: 100, threshold: 50_000 },
  { tier: 'POWER', maxLp: 999, maxStorageMB: 500, threshold: 200_000 },
]

const RANK: Record<LpTier, number> = {
  FREE: 0,
  STARTER: 1,
  POPULAR: 2,
  POWER: 3,
}

// Pilih tier tertinggi yang threshold-nya <= totalTokenPurchased.
function tierForTotal(total: number): TierConfig {
  let chosen = TIERS[0]
  for (const t of TIERS) {
    if (total >= t.threshold) chosen = t
  }
  return chosen
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

// Setelah user beli token (lewat Tripay atau transfer manual yang dikonfirmasi),
// hitung total cumulative purchased dan upgrade tier kalau memenuhi threshold.
// Idempotent — aman dipanggil berkali-kali, hanya menulis kalau ada perubahan.
//
// `db` opsional: lewatkan `tx` supaya update tier ikut dalam transaksi yang
// kredit token (mencegah token committed tapi tier gagal upgrade).
export async function upgradeTierFromPurchase(
  userId: string,
  _tokenAmount: number,
  db: Db = prisma,
): Promise<UserQuota> {
  // Pakai snapshot totalPurchased dari TokenBalance (sudah update setelah kredit).
  const balance = await db.tokenBalance.findUnique({ where: { userId } })
  const totalPurchased = balance?.totalPurchased ?? 0

  const target = tierForTotal(totalPurchased)
  const current = await getUserQuota(userId, db)

  // Hanya naik. Storage juga hanya naik (kalau quota baru lebih kecil, biarkan).
  if (RANK[target.tier] <= RANK[current.tier]) return current

  return db.userQuota.update({
    where: { userId },
    data: {
      tier: target.tier,
      maxLp: Math.max(current.maxLp, target.maxLp),
      maxStorageMB: Math.max(current.maxStorageMB, target.maxStorageMB),
    },
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
