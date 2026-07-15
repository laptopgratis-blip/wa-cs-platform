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
import type {
  LpTier,
  LpUpgradePackage,
  Prisma,
  Subscription,
  UserQuota,
} from '@prisma/client'

import { TIER_ENTITLEMENTS } from '@/lib/lp-quota'
import { prisma } from '@/lib/prisma'
import { waService } from '@/lib/wa-service'

// Subset Prisma client kompatibel dengan global `prisma` & `tx` dari
// $transaction(callback). Dipakai untuk fungsi yang opsional bisa dipanggil
// dari dalam transaksi caller (mis. webhook yang ingin atomik mark-paid +
// activate).
type Db = Prisma.TransactionClient | typeof prisma

// Urutan tier untuk menentukan "upgrade" (rank target > rank sumber).
// FREE tidak pernah punya subscription row, tapi masuk map untuk kelengkapan.
export const TIER_RANK: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  POPULAR: 2,
  POWER: 3,
}

// ─────────────────────────────────────────────────────────────────────────
// ENTITLEMENT RESOLVER — kuota LP adalah TURUNAN state subscription.
//
// "Sub hidup" = status ACTIVE atau CANCELLED (cancel tetap punya akses
// sampai endDate — janji di cancelSubscription) yang isLifetime atau
// endDate-nya masih di depan. Tier efektif = rank tertinggi antara semua
// sub hidup dan legacyTier (grandfather era pra-subscription).
//
// Satu-satunya penulis kolom entitlement UserQuota adalah
// syncQuotaFromSubscriptions — dipanggil di checkout, aktivasi, dan expire.
// Fungsi resolve-nya pure supaya bisa dites tanpa DB (pola hostTierAllowed).
// ─────────────────────────────────────────────────────────────────────────

export interface LiveSubInput {
  status: string
  isLifetime: boolean
  endDate: Date
  tier: string
  maxLp: number
  maxStorageMB: number
}

export function isSubscriptionLive(
  sub: { status: string; isLifetime: boolean; endDate: Date },
  now: Date,
): boolean {
  if (sub.status !== 'ACTIVE' && sub.status !== 'CANCELLED') return false
  return sub.isLifetime || sub.endDate.getTime() > now.getTime()
}

export interface LpEntitlement {
  tier: LpTier
  maxLp: number
  maxStorageMB: number
  maxVisitorMonth: number
  maxImageSizeMB: number
}

export function resolveLpEntitlement(
  subs: LiveSubInput[],
  now: Date,
  legacyTier?: LpTier | null,
): LpEntitlement {
  const live = subs.filter((s) => isSubscriptionLive(s, now))

  // Tier pemenang = rank tertinggi antara sub hidup dan legacyTier (floor).
  // Tier tak dikenal dianggap rank 0 (jatuh ke FREE).
  let tier: LpTier = 'FREE'
  for (const s of live) {
    if ((TIER_RANK[s.tier] ?? 0) > TIER_RANK[tier]) tier = s.tier as LpTier
  }
  if (legacyTier && (TIER_RANK[legacyTier] ?? 0) > TIER_RANK[tier]) {
    tier = legacyTier
  }

  // maxLp/maxStorage: default entitlement tier, di-MAX dengan paket sub
  // hidup ber-rank pemenang (admin bisa set paket lebih besar dari default).
  const base = TIER_ENTITLEMENTS[tier] ?? TIER_ENTITLEMENTS.FREE
  let maxLp = base.maxLp
  let maxStorageMB = base.maxStorageMB
  for (const s of live) {
    if ((TIER_RANK[s.tier] ?? 0) !== TIER_RANK[tier]) continue
    maxLp = Math.max(maxLp, s.maxLp)
    maxStorageMB = Math.max(maxStorageMB, s.maxStorageMB)
  }

  return {
    tier,
    maxLp,
    maxStorageMB,
    maxVisitorMonth: base.maxVisitorMonth,
    maxImageSizeMB: base.maxImageSizeMB,
  }
}

export interface DowngradeCheck {
  blocked: boolean
  blockingPackageName?: string
  blockingEndDate?: Date
}

// Blokir pembelian tier LEBIH RENDAH dari sub hidup tertinggi — kuota tidak
// akan naik (resolver ambil rank tertinggi) jadi user cuma buang token.
// Same-tier (extend) dan upgrade tetap lolos.
export function isDowngradePurchase(
  targetTier: string,
  liveSubs: Array<{ tier: string; packageName: string; endDate: Date }>,
): DowngradeCheck {
  let top: (typeof liveSubs)[number] | null = null
  for (const s of liveSubs) {
    if (!top || (TIER_RANK[s.tier] ?? 0) > (TIER_RANK[top.tier] ?? 0)) top = s
  }
  if (!top) return { blocked: false }
  if ((TIER_RANK[targetTier] ?? 0) >= (TIER_RANK[top.tier] ?? 0)) {
    return { blocked: false }
  }
  return {
    blocked: true,
    blockingPackageName: top.packageName,
    blockingEndDate: top.endDate,
  }
}

// Tulis ulang SEMUA kolom entitlement UserQuota dari state subscription saat
// ini. Idempotent & konvergen — aman dipanggil dari jalur mana pun (checkout,
// aktivasi manual, cron expire); storageUsedMB sengaja tidak disentuh.
export async function syncQuotaFromSubscriptions(
  userId: string,
  db: Db = prisma,
): Promise<UserQuota> {
  const now = new Date()
  const [subs, quota] = await Promise.all([
    db.subscription.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'CANCELLED'] },
        OR: [{ isLifetime: true }, { endDate: { gt: now } }],
      },
      select: {
        status: true,
        isLifetime: true,
        endDate: true,
        lpPackage: { select: { tier: true, maxLp: true, maxStorageMB: true } },
      },
    }),
    db.userQuota.findUnique({
      where: { userId },
      select: { legacyTier: true },
    }),
  ])

  const ent = resolveLpEntitlement(
    subs.map((s) => ({
      status: s.status,
      isLifetime: s.isLifetime,
      endDate: s.endDate,
      tier: s.lpPackage.tier,
      maxLp: s.lpPackage.maxLp,
      maxStorageMB: s.lpPackage.maxStorageMB,
    })),
    now,
    quota?.legacyTier ?? null,
  )

  const data = {
    tier: ent.tier,
    maxLp: ent.maxLp,
    maxStorageMB: ent.maxStorageMB,
    maxVisitorMonth: ent.maxVisitorMonth,
    maxImageSizeMB: ent.maxImageSizeMB,
    canAiGenerate: ent.tier !== 'FREE',
  }
  return db.userQuota.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
}

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

  // Cek subscription hidup existing user. Kalau sama plan (extend)
  // → startDate baru = endDate existing supaya benar-benar perpanjang.
  // CANCELLED ikut dihitung: aksesnya masih jalan sampai endDate, jadi
  // re-subscribe pasca-cancel tidak boleh menghanguskan sisa hari.
  const existingActive = await db.subscription.findFirst({
    where: {
      userId: sub.userId,
      status: { in: ['ACTIVE', 'CANCELLED'] },
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
  // Sync SEMUA kolom entitlement dari state subscription final. Aktivasi
  // paket ber-tier lebih rendah tidak akan menurunkan kuota (resolver ambil
  // rank tertinggi dari semua sub hidup).
  await syncQuotaFromSubscriptions(sub.userId, db)

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

// ─── UPGRADE CREDIT (proration) ────────────────────────────────────────
// Saat user upgrade ke tier LEBIH TINGGI padahal masih punya subscription
// aktif, sisa nilai plan lama dikreditkan sebagai potongan token — jangan
// hangus (kasus nyata 2026-07-11: user beli Popular, sejam kemudian mau
// Power; tanpa kredit, 39.500 token Popular-nya terbuang).
//
// Rumus per subscription aktif ber-tier lebih rendah:
//   tokenDibayar × porsiWaktuTersisa, dibulatkan ke bawah.
// tokenDibayar dari invoice PAID terakhir (tokenAmount); fallback konversi
// priceFinal pakai pricePerToken saat ini (invoice legacy pre-token).
// Extend plan sama tidak lewat sini (tier sama → bukan upgrade, tetap
// akumulasi endDate seperti biasa). Downgrade juga tidak dapat kredit.

export interface UpgradeCreditSource {
  subscriptionId: string
  packageName: string
  tier: string
  endDate: Date
  creditTokens: number
}

export interface UpgradeCreditInfo {
  creditTokens: number
  sources: UpgradeCreditSource[]
}

export async function computeUpgradeCredit(input: {
  userId: string
  targetTier: string
  pricePerToken: number
  db?: Db
}): Promise<UpgradeCreditInfo> {
  const db = input.db ?? prisma
  const targetRank = TIER_RANK[input.targetTier] ?? 0
  const now = new Date()

  const activeSubs = await db.subscription.findMany({
    where: {
      userId: input.userId,
      status: 'ACTIVE',
      isLifetime: false,
      endDate: { gt: now },
    },
    include: {
      lpPackage: { select: { name: true, tier: true } },
      invoices: {
        where: { status: 'PAID' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { tokenAmount: true },
      },
    },
  })

  const sources: UpgradeCreditSource[] = []
  for (const sub of activeSubs) {
    const sourceRank = TIER_RANK[sub.lpPackage.tier] ?? 0
    if (sourceRank >= targetRank) continue // bukan upgrade dari sub ini

    const totalMs = sub.endDate.getTime() - sub.startDate.getTime()
    if (totalMs <= 0) continue
    // Sub hasil extend bisa punya startDate di masa depan → sisa = penuh.
    const remainMs =
      sub.endDate.getTime() - Math.max(now.getTime(), sub.startDate.getTime())
    const ratio = Math.min(1, Math.max(0, remainMs / totalMs))

    const paidTokens =
      sub.invoices[0]?.tokenAmount ??
      Math.round(sub.priceFinal / input.pricePerToken)
    const creditTokens = Math.floor(paidTokens * ratio)
    if (creditTokens <= 0) continue

    sources.push({
      subscriptionId: sub.id,
      packageName: sub.lpPackage.name,
      tier: sub.lpPackage.tier,
      endDate: sub.endDate,
      creditTokens,
    })
  }

  return {
    creditTokens: sources.reduce((sum, s) => sum + s.creditTokens, 0),
    sources,
  }
}

export interface CheckoutWithTokensResult {
  subscriptionId: string
  invoiceId: string
  invoiceNumber: string
  packageName: string
  durationMonths: number
  priceIdr: number
  // Token yang benar-benar dipotong dari saldo (setelah kredit upgrade).
  tokenAmount: number
  // Kredit proration dari sisa subscription lama (0 kalau bukan upgrade).
  creditTokens: number
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

  // Resolve startDate — kalau user punya subscription hidup dgn plan sama,
  // extend dari endDate existing. Kalau plan beda (upgrade) atau belum ada,
  // mulai dari sekarang. Logic mirror activateSubscription supaya konsisten.
  // CANCELLED ikut: re-subscribe pasca-cancel chain dari endDate (sisa hari
  // tidak hangus — sesuai janji cancel "akses sampai endDate").
  const existingActive = await prisma.subscription.findFirst({
    where: {
      userId: input.userId,
      status: { in: ['ACTIVE', 'CANCELLED'] },
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

  // Atomic — saldo cek + deduct + create subscription + invoice + activate quota.
  // Pakai $transaction supaya kalau salah satu step gagal, semuanya rollback.
  const result = await prisma.$transaction(async (tx) => {
    // 0a. Blok pembelian DOWNGRADE — beli tier lebih rendah dari sub hidup
    //     tertinggi tidak menaikkan kuota apa pun (resolver ambil rank
    //     tertinggi), user cuma buang token. Same-tier (extend) & upgrade lolos.
    const liveSubs = await tx.subscription.findMany({
      where: {
        userId: input.userId,
        status: { in: ['ACTIVE', 'CANCELLED'] },
        OR: [{ isLifetime: true }, { endDate: { gt: new Date() } }],
      },
      select: {
        endDate: true,
        lpPackage: { select: { tier: true, name: true } },
      },
    })
    const downgrade = isDowngradePurchase(
      pkg.tier,
      liveSubs.map((s) => ({
        tier: s.lpPackage.tier,
        packageName: s.lpPackage.name,
        endDate: s.endDate,
      })),
    )
    if (downgrade.blocked) {
      const err = new Error(
        `Plan ${downgrade.blockingPackageName} kamu masih aktif sampai ${formatDateId(downgrade.blockingEndDate ?? new Date())}. Paket yang lebih rendah baru bisa dibeli setelah plan itu berakhir — atau pilih perpanjang/upgrade.`,
      )
      ;(err as Error & { code?: string }).code = 'DOWNGRADE_BLOCKED'
      throw err
    }

    // 0. Kredit proration untuk upgrade tier — hitung DI DALAM transaksi
    //    supaya konsisten (sub lama tidak bisa dikredit dua kali oleh race).
    const credit = await computeUpgradeCredit({
      userId: input.userId,
      targetTier: pkg.tier,
      pricePerToken,
      db: tx,
    })
    // Kredit tidak boleh melebihi harga paket baru (tidak ada saldo balik).
    const appliedCredit = Math.min(credit.creditTokens, tokenCost)
    const tokensDue = tokenCost - appliedCredit
    const creditNote =
      appliedCredit > 0
        ? ` — kredit upgrade ${appliedCredit.toLocaleString('id-ID')} token dari sisa ${credit.sources.map((s) => s.packageName).join(', ')}`
        : ''
    const description = `Subscription ${pkg.name} (${input.durationMonths} bulan)${creditNote}`

    // 1. Atomic deduct via WHERE balance >= due. Kalau saldo turun di antara
    //    preview dan checkout (user pakai token di tab lain), updateMany count=0.
    const deduct = await tx.tokenBalance.updateMany({
      where: {
        userId: input.userId,
        balance: { gte: tokensDue },
      },
      data: {
        balance: { decrement: tokensDue },
        totalUsed: { increment: tokensDue },
      },
    })
    if (deduct.count === 0) {
      // Throw special marker — caller convert ke error 402 dgn pesan ramah.
      const err = new Error('INSUFFICIENT_TOKEN')
      ;(err as Error & { code?: string }).code = 'INSUFFICIENT_TOKEN'
      throw err
    }

    // 1b. Supersede subscription lama yang dikreditkan — status REPLACED
    //     supaya: (a) tidak bisa dikredit lagi, (b) cron expire tidak
    //     men-downgrade user ke FREE saat endDate lama lewat.
    if (credit.sources.length > 0) {
      await tx.subscription.updateMany({
        where: { id: { in: credit.sources.map((s) => s.subscriptionId) } },
        data: {
          status: 'REPLACED',
          cancelledAt: new Date(),
          cancelledReason: `Upgrade ke ${pkg.name} — sisa nilai dikreditkan ${appliedCredit.toLocaleString('id-ID')} token`,
        },
      })
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
        tokenAmount: tokensDue,
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
        amount: -tokensDue,
        type: 'USAGE',
        description: `LP Subscription: ${pkg.name} (${input.durationMonths} bln)${creditNote}`,
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

    // 6. Sync SEMUA kolom entitlement UserQuota dari state subscription
    //    final (setelah create + supersede REPLACED di atas).
    await syncQuotaFromSubscriptions(input.userId, tx)

    // Read remaining balance untuk return ke caller.
    const balanceRow = await tx.tokenBalance.findUnique({
      where: { userId: input.userId },
      select: { balance: true },
    })

    return {
      subscriptionId: sub.id,
      invoiceId: inv.id,
      remainingBalance: balanceRow?.balance ?? 0,
      tokensDue,
      appliedCredit,
    }
  })

  // Notifikasi out of transaction — best-effort, jangan blokir aktivasi.
  void createNotification({
    userId: input.userId,
    subscriptionId: result.subscriptionId,
    type: 'PAYMENT_SUCCESS',
    channel: 'IN_APP',
    title: '✅ Subscription Aktif!',
    message: `Plan ${pkg.name} (${input.durationMonths} bulan) sudah aktif sampai ${formatDateId(endDate)}. Dipotong ${result.tokensDue.toLocaleString('id-ID')} token dari saldo${result.appliedCredit > 0 ? ` (sudah termasuk kredit upgrade ${result.appliedCredit.toLocaleString('id-ID')} token)` : ''}.`,
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
    tokenAmount: result.tokensDue,
    creditTokens: result.appliedCredit,
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

  // Guard: kalau user masih punya subscription ACTIVE LAIN yang belum
  // berakhir (mis. sudah upgrade tier — sub lama tertinggal ACTIVE di era
  // sebelum status REPLACED), expire baris ini SAJA tanpa downgrade quota.
  // Tanpa guard ini, user Power bisa mendadak turun ke FREE cuma karena
  // endDate sub lamanya lewat.
  const otherActive = await prisma.subscription.findFirst({
    where: {
      userId: sub.userId,
      id: { not: subscriptionId },
      status: 'ACTIVE',
      endDate: { gt: new Date() },
    },
    select: { id: true },
  })
  if (otherActive) {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'EXPIRED' },
    })
    return // jangan downgrade & jangan kirim notif "turun ke FREE"
  }

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
