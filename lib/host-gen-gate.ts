// Plan gating untuk Host AI (Live Shopping) — fitur berbayar, aktif mulai
// paket Popular. Basisnya subscription HIDUP (ACTIVE, atau CANCELLED yang
// belum lewat endDate — sama pola dgn order-system-gate), BUKAN UserQuota
// lifetime — supaya benar-benar butuh langganan berjalan.
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
    select: { role: true },
  })
  if (user?.role === 'ADMIN') return true

  // Cek langsung ke subscription HIDUP — bukan pointer currentSubscriptionId
  // (bisa basi saat sub dobel/expire parsial). CANCELLED ikut dihitung:
  // janji cancel = akses tetap jalan sampai endDate.
  const liveSubs = await prisma.subscription.findMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'CANCELLED'] },
      OR: [{ isLifetime: true }, { endDate: { gt: new Date() } }],
    },
    select: { lpPackage: { select: { tier: true } } },
  })
  return liveSubs.some((s) => hostTierAllowed(s.lpPackage.tier))
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
