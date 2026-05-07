// Service layer untuk lifecycle Subscription:
//   - activateSubscription: invoice PAID → set status ACTIVE, hitung endDate
//     (extend dari subscription existing kalau plan sama), update User
//     (currentSubscriptionId, currentPlanExpiresAt), upgrade UserQuota,
//     trigger notifikasi PAYMENT_SUCCESS.
//   - expireSubscription: dipanggil cron daily — set status EXPIRED, downgrade
//     User ke FREE, trigger notif EXPIRED.
//   - createNotification: helper IN_APP/WA, idempotent untuk reminder cron.
//   - sendWaNotificationToUser: best-effort kirim WA dari session admin ke
//     nomor user (kalau user punya WA session connected).
//
// Tidak ada eksplisit refund logic — prepaid no refund.
import type { LpUpgradePackage, Subscription } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

// Format tanggal Indonesia "5 Mei 2026" — dipakai banyak di message body.
function formatDateId(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Tambah `months` ke `from` dgn handle edge: 31 Jan + 1 bulan = 28/29 Feb (bukan 3 Maret).
function addMonths(from: Date, months: number): Date {
  const d = new Date(from)
  const targetMonth = d.getMonth() + months
  d.setMonth(targetMonth)
  // Kalau hari di-overflow (mis. 31 + 1 → bulan berikut tanggal melampaui),
  // mundur ke akhir bulan target.
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0)
  }
  return d
}

// Cari session WA ADMIN yg currently CONNECTED. Return null kalau tidak ada
// (cron akan skip WA notification, tetap kirim IN_APP).
async function findAdminWaSessionId(): Promise<string | null> {
  const session = await prisma.whatsappSession.findFirst({
    where: {
      status: 'CONNECTED',
      user: { role: 'ADMIN' },
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  })
  return session?.id ?? null
}

// Cari nomor WA user dari WhatsappSession-nya yg aktif. Return null kalau
// user belum pernah connect WA (tidak bisa kirim WA notification ke dia).
async function findUserWaPhone(userId: string): Promise<string | null> {
  const session = await prisma.whatsappSession.findFirst({
    where: { userId, phoneNumber: { not: null } },
    select: { phoneNumber: true },
    orderBy: { updatedAt: 'desc' },
  })
  return session?.phoneNumber ?? null
}

export interface CreateNotificationInput {
  userId: string
  subscriptionId?: string | null
  type: string // EXPIRING_7D | EXPIRING_3D | EXPIRING_1D | EXPIRED |
  // PAYMENT_SUCCESS | PAYMENT_FAILED | MANUAL_PROOF_UPLOADED (admin-side)
  channel?: 'IN_APP' | 'WA' | 'EMAIL'
  title: string
  message: string
  link?: string
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  await prisma.subscriptionNotification.create({
    data: {
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      type: input.type,
      channel: input.channel ?? 'IN_APP',
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      // sentAt diisi saat IN_APP (langsung "terkirim" ke DB).
      // Untuk WA, sentAt diisi setelah waService.sendMessage sukses.
      sentAt: input.channel === 'IN_APP' ? new Date() : null,
    },
  })
}

// Best-effort kirim WA notification dari session admin ke user. Tidak throw —
// log warning kalau gagal (cron tetap lanjut). Return true kalau benar-benar
// terkirim (atau false kalau skip karena prereq tidak ada).
export async function sendWaNotificationToUser(
  userId: string,
  input: { title: string; message: string; subscriptionId?: string | null },
): Promise<boolean> {
  const adminSessionId = await findAdminWaSessionId()
  if (!adminSessionId) return false
  const userPhone = await findUserWaPhone(userId)
  if (!userPhone) return false

  const text = `*${input.title}*\n\n${input.message}\n\n_— Hulao_`
  const send = await waService.sendMessage(adminSessionId, userPhone, text)
  if (!send.success) {
    console.warn(
      `[subscription] WA notif gagal ke ${userId} (${userPhone}):`,
      send.error,
    )
    return false
  }
  // Log notification record juga (channel=WA) untuk audit.
  await createNotification({
    userId,
    subscriptionId: input.subscriptionId ?? null,
    type: 'WA_NOTIFICATION',
    channel: 'WA',
    title: input.title,
    message: input.message,
  }).catch((err) => console.warn('[subscription] log WA notif gagal:', err))
  return true
}

// ─────────────────────────────────────────────────────────────────────────
// activateSubscription — invoice PAID → subscription ACTIVE.
//
// Logic extend: kalau user punya subscription ACTIVE dgn LP package SAMA
// (extend perpanjang), startDate baru = endDate existing. Kalau plan beda
// (upgrade), startDate baru = NOW (replace).
// ─────────────────────────────────────────────────────────────────────────

export async function activateSubscription(subscriptionId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { user: true, lpPackage: true },
  })
  if (!sub) throw new Error(`Subscription ${subscriptionId} tidak ditemukan`)
  if (sub.status === 'ACTIVE') {
    // Idempotent — invoice yg sama di-callback dua kali tidak boleh aktivasi ulang.
    return
  }

  // Cek subscription ACTIVE existing user. Kalau sama plan (extend)
  // → startDate baru = endDate existing supaya benar-benar perpanjang.
  const existingActive = await prisma.subscription.findFirst({
    where: {
      userId: sub.userId,
      status: 'ACTIVE',
      endDate: { gt: new Date() },
    },
    orderBy: { endDate: 'desc' },
  })

  let startDate: Date
  if (existingActive && existingActive.lpPackageId === sub.lpPackageId) {
    // Same package, extend dari endDate existing.
    startDate = existingActive.endDate
  } else {
    // Plan beda atau belum ada — mulai dari sekarang.
    startDate = new Date()
  }
  const endDate = addMonths(startDate, sub.durationMonths)

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE', startDate, endDate },
    }),
    prisma.user.update({
      where: { id: sub.userId },
      data: {
        currentSubscriptionId: subscriptionId,
        currentPlanExpiresAt: endDate,
      },
    }),
    // Upgrade UserQuota tier sesuai package — pakai existing logic supaya
    // konsisten (tier hanya naik, max(...) di-merge).
    prisma.userQuota.upsert({
      where: { userId: sub.userId },
      create: {
        userId: sub.userId,
        tier: sub.lpPackage.tier,
        maxLp: sub.lpPackage.maxLp,
        maxStorageMB: sub.lpPackage.maxStorageMB,
      },
      update: {
        tier: sub.lpPackage.tier,
        maxLp: sub.lpPackage.maxLp,
        maxStorageMB: sub.lpPackage.maxStorageMB,
      },
    }),
  ])

  await createNotification({
    userId: sub.userId,
    subscriptionId,
    type: 'PAYMENT_SUCCESS',
    channel: 'IN_APP',
    title: '✅ Subscription Aktif!',
    message: `Plan ${sub.lpPackage.name} (${sub.durationMonths} bulan) sudah aktif sampai ${formatDateId(endDate)}.`,
    link: '/billing/subscription',
  })

  // WA notification — best-effort, tidak block.
  void sendWaNotificationToUser(sub.userId, {
    title: 'Subscription Aktif',
    message: `Plan ${sub.lpPackage.name} aktif sampai ${formatDateId(endDate)}. Terima kasih sudah subscribe Hulao 🚀`,
    subscriptionId,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// expireSubscription — endDate lewat → status EXPIRED, downgrade ke FREE.
// Dipanggil cron daily /api/cron/subscription-expire.
// ─────────────────────────────────────────────────────────────────────────

export async function expireSubscription(subscriptionId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { user: true, lpPackage: true },
  })
  if (!sub) return
  if (sub.status !== 'ACTIVE') return // already expired/cancelled
  if (sub.isLifetime) return // lifetime grandfathered tidak boleh expire

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'EXPIRED' },
    }),
    prisma.user.update({
      where: { id: sub.userId },
      data: {
        currentSubscriptionId: null,
        currentPlanExpiresAt: null,
      },
    }),
    // Auto-downgrade UserQuota ke FREE.
    prisma.userQuota.update({
      where: { userId: sub.userId },
      data: {
        tier: 'FREE',
        maxLp: 1,
        maxStorageMB: 5,
        // canAiGenerate dan field plan-specific lain reset ke default FREE.
        canAiGenerate: false,
        maxImageSizeMB: 1,
        maxVisitorMonth: 1000,
      },
    }),
  ])

  await createNotification({
    userId: sub.userId,
    subscriptionId,
    type: 'EXPIRED',
    channel: 'IN_APP',
    title: '⏰ Subscription Berakhir',
    message: `Plan ${sub.lpPackage.name} kamu sudah berakhir. Akun otomatis turun ke FREE plan. Perpanjang untuk akses fitur premium kembali.`,
    link: '/pricing',
  })

  void sendWaNotificationToUser(sub.userId, {
    title: 'Subscription Berakhir',
    message: `Plan ${sub.lpPackage.name} sudah berakhir, akun turun ke FREE. Perpanjang di hulao.id/pricing untuk akses fitur premium lagi.`,
    subscriptionId,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// extendSubscription — admin tool untuk perpanjang manual tanpa pembayaran.
// Tambah `months` ke endDate existing, status tetap ACTIVE.
// ─────────────────────────────────────────────────────────────────────────

export async function extendSubscription(
  subscriptionId: string,
  months: number,
  reason: string,
): Promise<Subscription & { lpPackage: LpUpgradePackage }> {
  if (!Number.isInteger(months) || months <= 0 || months > 60) {
    throw new Error('Months harus integer 1-60')
  }
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { lpPackage: true },
  })
  if (!sub) throw new Error('Subscription tidak ditemukan')

  const newEndDate = addMonths(sub.endDate, months)
  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { endDate: newEndDate, status: 'ACTIVE' },
    include: { lpPackage: true },
  })

  // Sync user.currentPlanExpiresAt kalau ini current subscription.
  await prisma.user.updateMany({
    where: { id: sub.userId, currentSubscriptionId: subscriptionId },
    data: { currentPlanExpiresAt: newEndDate },
  })

  await createNotification({
    userId: sub.userId,
    subscriptionId,
    type: 'EXTENDED_BY_ADMIN',
    channel: 'IN_APP',
    title: '🎁 Subscription Diperpanjang',
    message: `Admin memperpanjang plan ${sub.lpPackage.name} sebanyak ${months} bulan. Sekarang aktif sampai ${formatDateId(newEndDate)}. Catatan: ${reason}`,
    link: '/billing/subscription',
  })

  return updated
}

// ─────────────────────────────────────────────────────────────────────────
// cancelSubscription — user/admin cancel. Tidak refund. Tetap aktif sampai
// endDate, lalu cron expire akan turunkan ke FREE seperti biasa.
// ─────────────────────────────────────────────────────────────────────────

export async function cancelSubscription(
  subscriptionId: string,
  reason: string,
  byUserId?: string,
): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  })
  if (!sub) throw new Error('Subscription tidak ditemukan')
  if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') return

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledReason: reason.slice(0, 500),
    },
  })

  await createNotification({
    userId: sub.userId,
    subscriptionId,
    type: 'CANCELLED',
    channel: 'IN_APP',
    title: '❎ Subscription Dibatalkan',
    message: `Subscription kamu dibatalkan. Akses fitur premium tetap aktif sampai ${formatDateId(sub.endDate)}, setelah itu turun ke FREE plan.`,
    link: '/billing/subscription',
  })
  void byUserId // future use: log siapa yg cancel (audit)
}
