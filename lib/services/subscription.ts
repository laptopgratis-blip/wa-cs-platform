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
import type { LpUpgradePackage, Prisma, Subscription } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

// Subset Prisma client kompatibel dengan global `prisma` & `tx` dari
// $transaction(callback). Dipakai untuk fungsi yang opsional bisa dipanggil
// dari dalam transaksi caller (mis. webhook yang ingin atomik mark-paid +
// activate).
type Db = Prisma.TransactionClient | typeof prisma

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

// Inti aktivasi yang menerima `db` (transactional client atau global
// prisma) sehingga caller bisa mengkomposisi dengan operasi lain dalam satu
// transaksi (mis. webhook: mark invoice PAID + activate dalam satu tx).
async function activateSubscriptionCore(
  subscriptionId: string,
  db: Db,
): Promise<{ ok: boolean; userId?: string; packageName?: string; endDate?: Date; durationMonths?: number }> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { user: true, lpPackage: true },
  })
  if (!sub) throw new Error(`Subscription ${subscriptionId} tidak ditemukan`)
  if (sub.status === 'ACTIVE') {
    // Idempotent — invoice yg sama di-callback dua kali tidak boleh aktivasi ulang.
    return { ok: false }
  }

  // Cek subscription ACTIVE existing user. Kalau sama plan (extend)
  // → startDate baru = endDate existing supaya benar-benar perpanjang.
  const existingActive = await db.subscription.findFirst({
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

  await db.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'ACTIVE', startDate, endDate },
  })
  await db.user.update({
    where: { id: sub.userId },
    data: {
      currentSubscriptionId: subscriptionId,
      currentPlanExpiresAt: endDate,
    },
  })
  await db.userQuota.upsert({
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
  })

  return {
    ok: true,
    userId: sub.userId,
    packageName: sub.lpPackage.name,
    endDate,
    durationMonths: sub.durationMonths,
  }
}

// Public API. Kalau `tx` diberikan, jalankan core di tx caller (caller
// yang bertanggung jawab commit). Notifikasi tetap fire setelah core sukses;
// caller yang pakai tx perlu sadar notif fire walau tx caller belum commit
// — best-effort & informational, jadi acceptable.
//
// Tanpa `tx`: bungkus core dalam $transaction(callback) sendiri supaya
// invoice→subscription→user→quota tetap atomik (mirror perilaku lama).
export async function activateSubscription(
  subscriptionId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const result = tx
    ? await activateSubscriptionCore(subscriptionId, tx)
    : await prisma.$transaction((innerTx) =>
        activateSubscriptionCore(subscriptionId, innerTx),
      )
  if (!result.ok || !result.userId || !result.endDate || !result.packageName)
    return

  await createNotification({
    userId: result.userId,
    subscriptionId,
    type: 'PAYMENT_SUCCESS',
    channel: 'IN_APP',
    title: '✅ Subscription Aktif!',
    message: `Plan ${result.packageName} (${result.durationMonths} bulan) sudah aktif sampai ${formatDateId(result.endDate)}.`,
    link: '/billing/subscription',
  })

  // WA notification — best-effort, tidak block.
  void sendWaNotificationToUser(result.userId, {
    title: 'Subscription Aktif',
    message: `Plan ${result.packageName} aktif sampai ${formatDateId(result.endDate)}. Terima kasih sudah subscribe Hulao 🚀`,
    subscriptionId,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// checkoutSubscriptionWithTokens — atomic checkout pakai saldo token.
// Flow:
//   1. Validate package + user + saldo cukup
//   2. Hitung priceFinal IDR + token equivalent (snapshot pricePerToken)
//   3. Resolve startDate (extend dari ACTIVE existing kalau plan sama)
//   4. Atomic transaction:
//      a. UPDATE TokenBalance balance >= cost (race-safe via WHERE clause)
//      b. INSERT TokenTransaction (USAGE)
//      c. INSERT Subscription ACTIVE (langsung, no PENDING)
//      d. INSERT SubscriptionInvoice PAID (paymentMethod=TOKEN_BALANCE)
//      e. UPDATE User.currentSubscriptionId/currentPlanExpiresAt
//      f. UPSERT UserQuota tier+maxLp+maxStorageMB
//   5. Trigger notifikasi (out of tx, best-effort)
//
// Kembalikan semua info yg dibutuhkan endpoint untuk respond ke client.
// Throw error spesifik kalau:
//   - Package tidak ada / inactive / priceMonthly=0
//   - Saldo token tidak cukup (race-safe — kalau saldo turun di tengah, tx
//     update count=0 dan kita rollback)
// ─────────────────────────────────────────────────────────────────────────

import {
  calculateSubscriptionPriceFull,
  generateInvoiceNumber,
} from '@/lib/subscription-pricing'

const DEFAULT_PRICE_PER_TOKEN_RP = 2

export interface CheckoutWithTokensResult {
  subscriptionId: string
  invoiceId: string
  invoiceNumber: string
  packageName: string
  durationMonths: number
  priceIdr: number
  tokenAmount: number
  pricePerToken: number
  startDate: Date
  endDate: Date
  remainingBalance: number
}

export async function checkoutSubscriptionWithTokens(input: {
  userId: string
  lpPackageId: string
  durationMonths: number
}): Promise<CheckoutWithTokensResult> {
  const pkg = await prisma.lpUpgradePackage.findUnique({
    where: { id: input.lpPackageId },
  })
  if (!pkg || !pkg.isActive) {
    throw new Error('Paket tidak ditemukan atau tidak aktif')
  }
  if (pkg.priceMonthly <= 0) {
    throw new Error('Paket ini belum bisa di-subscribe (harga belum disetel admin)')
  }

  // Pricing snapshot — pakai pricePerToken aktif saat checkout. Kalau setting
  // belum ada (shouldn't happen di prod), pakai default 2.
  const settings = await prisma.pricingSettings
    .findFirst({ select: { pricePerToken: true } })
    .catch(() => null)
  const pricePerToken = settings?.pricePerToken ?? DEFAULT_PRICE_PER_TOKEN_RP

  const calc = calculateSubscriptionPriceFull(
    pkg.priceMonthly,
    input.durationMonths,
    pricePerToken,
  )
  const tokenCost = calc.priceFinalTokens

  // Resolve startDate — kalau user punya subscription ACTIVE dgn plan sama,
  // extend dari endDate existing. Kalau plan beda (upgrade) atau belum ada,
  // mulai dari sekarang. Logic mirror activateSubscription supaya konsisten.
  const existingActive = await prisma.subscription.findFirst({
    where: {
      userId: input.userId,
      status: 'ACTIVE',
      endDate: { gt: new Date() },
    },
    orderBy: { endDate: 'desc' },
  })
  const startDate =
    existingActive && existingActive.lpPackageId === input.lpPackageId
      ? existingActive.endDate
      : new Date()
  const endDate = addMonths(startDate, input.durationMonths)

  const invoiceNumber = generateInvoiceNumber()
  const description = `Subscription ${pkg.name} (${input.durationMonths} bulan)`

  // Atomic — saldo cek + deduct + create subscription + invoice + activate quota.
  // Pakai $transaction supaya kalau salah satu step gagal, semuanya rollback.
  const result = await prisma.$transaction(async (tx) => {
    // 1. Atomic deduct via WHERE balance >= cost. Kalau saldo turun di antara
    //    preview dan checkout (user pakai token di tab lain), updateMany count=0.
    const deduct = await tx.tokenBalance.updateMany({
      where: {
        userId: input.userId,
        balance: { gte: tokenCost },
      },
      data: {
        balance: { decrement: tokenCost },
        totalUsed: { increment: tokenCost },
      },
    })
    if (deduct.count === 0) {
      // Throw special marker — caller convert ke error 402 dgn pesan ramah.
      const err = new Error('INSUFFICIENT_TOKEN')
      ;(err as Error & { code?: string }).code = 'INSUFFICIENT_TOKEN'
      throw err
    }

    // 2. Create Subscription ACTIVE (langsung, no PENDING).
    const sub = await tx.subscription.create({
      data: {
        userId: input.userId,
        lpPackageId: pkg.id,
        durationMonths: input.durationMonths,
        startDate,
        endDate,
        status: 'ACTIVE',
        priceBase: calc.priceBase,
        discountPct: calc.discountPct,
        priceFinal: calc.priceFinal,
      },
      select: { id: true },
    })

    // 3. Create SubscriptionInvoice PAID (paymentMethod=TOKEN_BALANCE).
    const inv = await tx.subscriptionInvoice.create({
      data: {
        subscriptionId: sub.id,
        invoiceNumber,
        amount: calc.priceFinal,
        uniqueCode: 0,
        description,
        status: 'PAID',
        paidAt: new Date(),
        paymentMethod: 'TOKEN_BALANCE',
        tokenAmount: tokenCost,
        // expiresAt — tidak relevan untuk TOKEN_BALANCE (langsung paid),
        // tapi field NOT NULL di schema. Pakai endDate sebagai placeholder
        // logis (invoice valid sampai subscription berakhir).
        expiresAt: endDate,
      },
      select: { id: true },
    })

    // 4. Log TokenTransaction USAGE — reference invoice untuk audit trail.
    await tx.tokenTransaction.create({
      data: {
        userId: input.userId,
        amount: -tokenCost,
        type: 'USAGE',
        description: `LP Subscription: ${pkg.name} (${input.durationMonths} bln)`,
        reference: inv.id,
      },
    })

    // 5. Update User pointer ke subscription baru.
    await tx.user.update({
      where: { id: input.userId },
      data: {
        currentSubscriptionId: sub.id,
        currentPlanExpiresAt: endDate,
      },
    })

    // 6. Upgrade UserQuota tier+maxLp+maxStorageMB.
    await tx.userQuota.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        tier: pkg.tier,
        maxLp: pkg.maxLp,
        maxStorageMB: pkg.maxStorageMB,
      },
      update: {
        tier: pkg.tier,
        maxLp: pkg.maxLp,
        maxStorageMB: pkg.maxStorageMB,
      },
    })

    // Read remaining balance untuk return ke caller.
    const balanceRow = await tx.tokenBalance.findUnique({
      where: { userId: input.userId },
      select: { balance: true },
    })

    return {
      subscriptionId: sub.id,
      invoiceId: inv.id,
      remainingBalance: balanceRow?.balance ?? 0,
    }
  })

  // Notifikasi out of transaction — best-effort, jangan blokir aktivasi.
  void createNotification({
    userId: input.userId,
    subscriptionId: result.subscriptionId,
    type: 'PAYMENT_SUCCESS',
    channel: 'IN_APP',
    title: '✅ Subscription Aktif!',
    message: `Plan ${pkg.name} (${input.durationMonths} bulan) sudah aktif sampai ${formatDateId(endDate)}. Dipotong ${tokenCost.toLocaleString('id-ID')} token dari saldo.`,
    link: '/billing/subscription',
  }).catch((err) => console.error('[subscription] notif gagal:', err))

  void sendWaNotificationToUser(input.userId, {
    title: 'Subscription Aktif',
    message: `Plan ${pkg.name} aktif sampai ${formatDateId(endDate)}. Terima kasih sudah subscribe Hulao 🚀`,
    subscriptionId: result.subscriptionId,
  })

  return {
    subscriptionId: result.subscriptionId,
    invoiceId: result.invoiceId,
    invoiceNumber,
    packageName: pkg.name,
    durationMonths: input.durationMonths,
    priceIdr: calc.priceFinal,
    tokenAmount: tokenCost,
    pricePerToken,
    startDate,
    endDate,
    remainingBalance: result.remainingBalance,
  }
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
