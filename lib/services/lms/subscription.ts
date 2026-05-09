// LMS Subscription Service — atomic checkout via saldo token, mirror flow
// LP subscription (lib/services/subscription.ts:checkoutSubscriptionWithTokens).
//
// Flow:
//   1. Validate package (PUBLISHED, priceMonthly > 0)
//   2. Hitung priceFinal IDR + token equivalent (snapshot pricePerToken aktif)
//   3. Resolve startDate (extend dari ACTIVE kalau plan sama)
//   4. Atomic transaction:
//      a. UPDATE TokenBalance balance >= cost (race-safe)
//      b. INSERT TokenTransaction USAGE
//      c. INSERT LmsSubscription ACTIVE (no PENDING)
//      d. INSERT LmsSubscriptionInvoice PAID
//      e. UPSERT LmsQuota tier+limits
//   5. Return invoice + saldo terbaru
import { addMonths } from 'date-fns'

import { prisma } from '@/lib/prisma'
import {
  VALID_DURATIONS,
  calculateSubscriptionPriceFull,
  generateInvoiceNumber,
} from '@/lib/subscription-pricing'

import { applyQuotaFromPackage } from './quota'

const DEFAULT_PRICE_PER_TOKEN_RP = 2

export interface LmsCheckoutResult {
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

export async function checkoutLmsSubscriptionWithTokens(input: {
  userId: string
  lmsPackageId: string
  durationMonths: number
}): Promise<LmsCheckoutResult> {
  if (!VALID_DURATIONS.includes(input.durationMonths)) {
    throw new Error(`Durasi tidak valid: ${input.durationMonths}`)
  }

  const pkg = await prisma.lmsUpgradePackage.findUnique({
    where: { id: input.lmsPackageId },
  })
  if (!pkg || !pkg.isActive) {
    throw new Error('Paket LMS tidak ditemukan atau tidak aktif')
  }
  if (pkg.priceMonthly <= 0) {
    throw new Error(
      'Paket ini belum bisa di-subscribe (harga belum disetel admin)',
    )
  }
  // FREE tier tidak boleh checkout — itu default lazy-create.
  if (pkg.tier === 'FREE') {
    throw new Error('FREE tier tidak butuh checkout')
  }

  // Pricing snapshot
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

  // Resolve startDate — extend dari ACTIVE existing kalau tier sama, else
  // mulai sekarang (upgrade replace).
  const existingActive = await prisma.lmsSubscription.findFirst({
    where: {
      userId: input.userId,
      status: 'ACTIVE',
      endDate: { gt: new Date() },
    },
    orderBy: { endDate: 'desc' },
  })
  const startDate =
    existingActive && existingActive.lmsPackageId === input.lmsPackageId
      ? existingActive.endDate
      : new Date()
  const endDate = addMonths(startDate, input.durationMonths)

  const invoiceNumber = generateInvoiceNumber()
  const description = `Subscription LMS ${pkg.name} (${input.durationMonths} bulan)`

  const result = await prisma.$transaction(async (tx) => {
    // 1. Atomic deduct via WHERE balance >= cost.
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
      const err = new Error('INSUFFICIENT_TOKEN')
      ;(err as Error & { code?: string }).code = 'INSUFFICIENT_TOKEN'
      throw err
    }

    // 2. Create LmsSubscription ACTIVE.
    const sub = await tx.lmsSubscription.create({
      data: {
        userId: input.userId,
        lmsPackageId: pkg.id,
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

    // 3. Create LmsSubscriptionInvoice PAID.
    const inv = await tx.lmsSubscriptionInvoice.create({
      data: {
        subscriptionId: sub.id,
        invoiceNumber,
        amount: calc.priceFinal,
        tokenAmount: tokenCost,
        description,
        status: 'PAID',
        paidAt: new Date(),
      },
      select: { id: true },
    })

    // 4. TokenTransaction USAGE
    await tx.tokenTransaction.create({
      data: {
        userId: input.userId,
        amount: -tokenCost,
        type: 'USAGE',
        description: `LMS Subscription: ${pkg.name} (${input.durationMonths} bln)`,
        reference: inv.id,
      },
    })

    // 5. Upsert LmsQuota — apply tier+limits. Pakai helper supaya consistent.
    await tx.lmsQuota.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        tier: pkg.tier,
        maxCourses: pkg.maxCourses,
        maxLessonsPerCourse: pkg.maxLessonsPerCourse,
        maxStudentsPerCourse: pkg.maxStudentsPerCourse,
        maxFileStorageMB: pkg.maxFileStorageMB,
        canUseDripSchedule: pkg.canUseDripSchedule,
        canIssueCertificate: pkg.canIssueCertificate,
      },
      update: {
        tier: pkg.tier,
        maxCourses: pkg.maxCourses,
        maxLessonsPerCourse: pkg.maxLessonsPerCourse,
        maxStudentsPerCourse: pkg.maxStudentsPerCourse,
        maxFileStorageMB: pkg.maxFileStorageMB,
        canUseDripSchedule: pkg.canUseDripSchedule,
        canIssueCertificate: pkg.canIssueCertificate,
      },
    })

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

// Read-only preview untuk UI dialog konfirmasi. Tidak buat record apapun.
export async function previewLmsCheckout(input: {
  userId: string
  lmsPackageId: string
  durationMonths: number
}) {
  const pkg = await prisma.lmsUpgradePackage.findUnique({
    where: { id: input.lmsPackageId },
  })
  if (!pkg || !pkg.isActive || pkg.priceMonthly <= 0) {
    throw new Error('Paket tidak valid')
  }
  const settings = await prisma.pricingSettings
    .findFirst({ select: { pricePerToken: true } })
    .catch(() => null)
  const pricePerToken = settings?.pricePerToken ?? DEFAULT_PRICE_PER_TOKEN_RP
  const calc = calculateSubscriptionPriceFull(
    pkg.priceMonthly,
    input.durationMonths,
    pricePerToken,
  )
  const balance = await prisma.tokenBalance
    .findUnique({
      where: { userId: input.userId },
      select: { balance: true },
    })
    .then((b) => b?.balance ?? 0)
  return {
    package: {
      id: pkg.id,
      name: pkg.name,
      tier: pkg.tier,
      description: pkg.description,
      maxCourses: pkg.maxCourses,
      maxLessonsPerCourse: pkg.maxLessonsPerCourse,
      maxStudentsPerCourse: pkg.maxStudentsPerCourse,
      priceMonthly: pkg.priceMonthly,
    },
    durationMonths: input.durationMonths,
    discountPct: calc.discountPct,
    priceBase: calc.priceBase,
    discountAmount: calc.discountAmount,
    priceIdr: calc.priceFinal,
    tokenAmount: calc.priceFinalTokens,
    pricePerToken,
    currentBalance: balance,
    sufficientBalance: balance >= calc.priceFinalTokens,
    shortageTokens: Math.max(0, calc.priceFinalTokens - balance),
  }
}
