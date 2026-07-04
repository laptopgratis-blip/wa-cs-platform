// Plan gating untuk Host AI (Live Shopping) — fitur berbayar, aktif mulai
// paket Popular. Basisnya subscription AKTIF (sama pola dgn order-system-gate),
// BUKAN UserQuota lifetime — supaya benar-benar butuh langganan berjalan.
//
// Guard dipasang di choke point service (orchestrateHostPrompt +
// generateHostImage). Karena video Kling selalu butuh baseline image dulu,
// menutup generate image otomatis menutup seluruh jalur generate host.
// ADMIN bypass (role=ADMIN) supaya ops Hulao tetap bisa tes tanpa langganan.
import { prisma } from '@/lib/prisma'

const RANK: Record<string, number> = { FREE: 0, STARTER: 1, POPULAR: 2, POWER: 3 }
const MIN_RANK = RANK.POPULAR

// Pure decision — tier mana yang boleh. Dipisah biar bisa dites tanpa DB.
export function hostTierAllowed(tier: string): boolean {
  return (RANK[tier] ?? 0) >= MIN_RANK
}

export async function hasHostGenAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, currentSubscriptionId: true },
  })
  if (user?.role === 'ADMIN') return true
  if (!user?.currentSubscriptionId) return false

  const sub = await prisma.subscription.findUnique({
    where: { id: user.currentSubscriptionId },
    select: { status: true, lpPackage: { select: { tier: true } } },
  })
  if (!sub || sub.status !== 'ACTIVE') return false
  return hostTierAllowed(sub.lpPackage.tier)
}

// Throw versi — dipanggil di service generate. Pesan langsung dipakai sebagai
// body error oleh endpoint (mereka return jsonError(e.message)).
export async function assertHostGenAccess(userId: string): Promise<void> {
  if (!(await hasHostGenAccess(userId))) {
    throw new Error(
      'Fitur Host AI (Live Shopping) tersedia mulai paket Popular. Upgrade dulu di /pricing untuk mengaktifkannya.',
    )
  }
}
