// GET /api/subscription/preview?lpPackageId=...&durationMonths=...
// Cost breakdown sebelum user confirm checkout. Return:
//   - paket info (nama, tier, maxLp, maxStorageMB)
//   - priceIdr (priceFinal setelah diskon durasi)
//   - tokenAmount (priceFinal converted ke token pakai pricePerToken aktif)
//   - currentBalance (saldo token user sekarang)
//   - sufficientBalance flag
//   - breakdown diskon (durationMonths, discountPct, priceBase, discountAmount)
//
// Endpoint ini IDEMPOTENT (read-only) — tidak buat record apapun. Hanya untuk
// dialog konfirmasi di UI.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  VALID_DURATIONS,
  calculateSubscriptionPriceFull,
} from '@/lib/subscription-pricing'

const DEFAULT_PRICE_PER_TOKEN_RP = 2

export async function GET(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const url = new URL(req.url)
  const lpPackageId = url.searchParams.get('lpPackageId')
  const durationMonthsParam = url.searchParams.get('durationMonths')
  if (!lpPackageId) return jsonError('lpPackageId wajib diisi')
  const durationMonths = Number(durationMonthsParam)
  if (!VALID_DURATIONS.includes(durationMonths)) {
    return jsonError(
      `durationMonths harus salah satu: ${VALID_DURATIONS.join(', ')}`,
    )
  }

  const pkg = await prisma.lpUpgradePackage.findUnique({
    where: { id: lpPackageId },
    select: {
      id: true,
      name: true,
      tier: true,
      description: true,
      maxLp: true,
      maxStorageMB: true,
      priceMonthly: true,
      isActive: true,
    },
  })
  if (!pkg || !pkg.isActive) {
    return jsonError('Paket tidak ditemukan atau tidak aktif', 404)
  }
  if (pkg.priceMonthly <= 0) {
    return jsonError(
      'Paket ini belum bisa di-subscribe (harga belum disetel admin)',
    )
  }

  const settings = await prisma.pricingSettings
    .findFirst({ select: { pricePerToken: true } })
    .catch(() => null)
  const pricePerToken = settings?.pricePerToken ?? DEFAULT_PRICE_PER_TOKEN_RP

  const calc = calculateSubscriptionPriceFull(
    pkg.priceMonthly,
    durationMonths,
    pricePerToken,
  )

  const balance = await prisma.tokenBalance
    .findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    })
    .then((b) => b?.balance ?? 0)

  return jsonOk({
    package: {
      id: pkg.id,
      name: pkg.name,
      tier: pkg.tier,
      description: pkg.description,
      maxLp: pkg.maxLp,
      maxStorageMB: pkg.maxStorageMB,
      priceMonthly: pkg.priceMonthly,
    },
    durationMonths,
    discountPct: calc.discountPct,
    priceBase: calc.priceBase,
    discountAmount: calc.discountAmount,
    priceIdr: calc.priceFinal,
    tokenAmount: calc.priceFinalTokens,
    pricePerToken,
    currentBalance: balance,
    sufficientBalance: balance >= calc.priceFinalTokens,
    shortageTokens: Math.max(0, calc.priceFinalTokens - balance),
  })
}
