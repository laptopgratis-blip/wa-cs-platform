// Halaman billing — saldo token + daftar paket + riwayat transaksi
// + section transfer manual yang sedang menunggu/baru dikonfirmasi.
import type { ManualPaymentStatus, TokenTxType } from '@prisma/client'
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OnboardingGoalCard } from '@/components/onboarding/OnboardingGoalCard'
import { PostPublishReturnBanner } from '@/components/onboarding/PostPublishReturnBanner'
import { authOptions } from '@/lib/auth'
import { computeValueUnits } from '@/lib/billing/value-units'
import { formatNumber, formatRupiah } from '@/lib/format'
import { getPricingSettings } from '@/lib/pricing-settings'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'

const MANUAL_STATUS_LABEL: Record<ManualPaymentStatus, string> = {
  PENDING: 'Menunggu Verifikasi',
  CONFIRMED: 'Dikonfirmasi',
  REJECTED: 'Ditolak',
}

const MANUAL_STATUS_VARIANT: Record<
  ManualPaymentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
}

const MANUAL_STATUS_ICON: Record<
  ManualPaymentStatus,
  typeof Clock
> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  REJECTED: XCircle,
}

const TX_TYPE_LABEL: Record<TokenTxType, string> = {
  PURCHASE: 'Pembelian',
  USAGE: 'Pemakaian',
  REFUND: 'Refund',
  BONUS: 'Bonus',
  ADJUSTMENT: 'Penyesuaian',
}

const TX_TYPE_VARIANT: Record<
  TokenTxType,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PURCHASE: 'default',
  USAGE: 'outline',
  REFUND: 'secondary',
  BONUS: 'secondary',
  ADJUSTMENT: 'outline',
}

export const dynamic = 'force-dynamic'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const resolvedParams = await searchParams
  const PAGE_SIZE = 10
  const currentPage = Math.max(1, parseInt(resolvedParams.page ?? '1', 10) || 1)

  // Tampilkan manual payment yang masih PENDING + REJECTED, plus CONFIRMED
  // dari 3 hari terakhir (biar user lihat konfirmasi terbaru sekilas).
  const manualSince = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  const [
    tokenBalance,
    packages,
    transactions,
    txCount,
    manualPayments,
    userMeta,
    lpPlansRaw,
    pricingSettings,
  ] = await Promise.all([
    prisma.tokenBalance.findUnique({ where: { userId: session.user.id } }),
    prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.tokenTransaction.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        amount: true,
        type: true,
        description: true,
        createdAt: true,
      },
    }),
    prisma.tokenTransaction.count({ where: { userId: session.user.id } }),
    prisma.manualPayment.findMany({
      where: {
        userId: session.user.id,
        purpose: 'TOKEN_PURCHASE',
        OR: [
          { status: { in: ['PENDING', 'REJECTED'] } },
          { status: 'CONFIRMED', confirmedAt: { gte: manualSince } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { package: { select: { name: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingGoal: true },
    }),
    prisma.lpUpgradePackage.findMany({
      where: { isActive: true, priceMonthly: { gt: 0 } },
      select: { name: true, priceMonthly: true, canUseOrderSystem: true },
      orderBy: { priceMonthly: 'asc' },
    }),
    getPricingSettings(),
  ])
  const lpPlans = lpPlansRaw.map((p) => ({
    name: p.name,
    priceMonthly: p.priceMonthly,
    canUseOrderSystem: p.canUseOrderSystem,
  }))

  const balance = tokenBalance?.balance ?? 0
  const totalPurchased = tokenBalance?.totalPurchased ?? 0
  const totalUsed = tokenBalance?.totalUsed ?? 0
  const totalPages = Math.max(1, Math.ceil(txCount / PAGE_SIZE))
  const onboardingGoal = userMeta?.onboardingGoal as
    | 'CS_AI'
    | 'SELL_LP'
    | 'SELL_WA'
    | 'LMS'
    | null
    | undefined

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Billing & Saldo Token
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Saldo token kamu = bahan bakar semua fitur Hulao. Berlangganan paket,
          generate konten, balas WA pakai AI — semua potong dari saldo.
        </p>
      </div>

      <PostPublishReturnBanner />

      <OnboardingGoalCard currentGoal={onboardingGoal ?? null} />

      <Card className="overflow-hidden rounded-xl border-primary-200 bg-gradient-to-br from-primary-50 via-white to-primary-50">
        <CardHeader className="pb-2">
          <CardDescription className="font-medium uppercase tracking-wider text-primary-600 text-xs">
            Saldo Token Saat Ini
          </CardDescription>
          <CardTitle className="font-display text-4xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50 tabular-nums">
            {formatNumber(balance)}
            <span className="ml-2 text-base font-medium text-warm-500">token</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 pt-2 text-sm sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground">Total dibeli</div>
            <div className="font-medium">{formatNumber(totalPurchased)} token</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total terpakai</div>
            <div className="font-medium">{formatNumber(totalUsed)} token</div>
          </div>
          <div>
            <div className="text-muted-foreground">Tarif normal</div>
            <div className="font-medium tabular-nums">
              {formatRupiah(Math.round(pricingSettings.pricePerToken))} / token
            </div>
          </div>
        </CardContent>
      </Card>

      {manualPayments.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
            Transfer Manual
          </h2>
          <div className="space-y-3">
            {manualPayments.map((mp) => {
              const StatusIcon = MANUAL_STATUS_ICON[mp.status]
              return (
                <Card key={mp.id} className="rounded-xl border-warm-200">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={MANUAL_STATUS_VARIANT[mp.status]}
                          className="flex items-center gap-1.5"
                        >
                          <StatusIcon className="size-3" />
                          {MANUAL_STATUS_LABEL[mp.status]}
                        </Badge>
                        <span className="text-sm font-medium text-warm-700">
                          Paket {mp.package?.name ?? '—'}
                        </span>
                        <span className="text-xs text-warm-500">
                          ({formatNumber(mp.tokenAmount)} token)
                        </span>
                      </div>
                      <div className="text-sm text-warm-600">
                        Total transfer:{' '}
                        <span className="font-semibold tabular-nums">
                          {formatRupiah(mp.totalAmount)}
                        </span>{' '}
                        <span className="text-xs text-warm-500">
                          (kode unik {mp.uniqueCode})
                        </span>
                      </div>
                      <div className="text-xs text-warm-500">
                        Dibuat{' '}
                        {mp.createdAt.toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      {mp.status === 'REJECTED' && mp.rejectionReason && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                          <span className="font-semibold">Alasan ditolak:</span>{' '}
                          {mp.rejectionReason}
                        </div>
                      )}
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                    >
                      <Link href={`/checkout/manual/${mp.id}`}>
                        Lihat Detail
                        <ExternalLink className="ml-2 size-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
          Riwayat Transaksi
        </h2>
        {transactions.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Belum ada transaksi.
            </CardContent>
          </Card>
        ) : (
          <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.createdAt.toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TX_TYPE_VARIANT[t.type]} className="font-normal">
                        {TX_TYPE_LABEL[t.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.description ?? '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        t.amount < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {t.amount > 0 ? '+' : ''}
                      {formatNumber(t.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1 py-3">
              <p className="text-xs text-warm-500">
                Halaman {currentPage} dari {totalPages} ({txCount} transaksi)
              </p>
              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/billing?page=${currentPage - 1}`}>
                      <ChevronLeft className="mr-1 size-4" />
                      Prev
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    <ChevronLeft className="mr-1 size-4" />
                    Prev
                  </Button>
                )}
                {currentPage < totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/billing?page=${currentPage + 1}`}>
                      Next
                      <ChevronRight className="ml-1 size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next
                    <ChevronRight className="ml-1 size-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
          </>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
          Top-up Saldo Token
        </h2>
        <p className="mb-4 text-sm text-warm-500">
          Token = bahan bakar semua fitur Hulao. Saldo dipakai untuk berlangganan
          paket Landing Page, Order System, AI konten, balas WA otomatis, dst.
          Tanpa expired.
        </p>
        {packages.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Belum ada paket aktif. Hubungi admin.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {packages.map((pkg) => {
              const pricePerToken = pkg.tokenAmount > 0 ? pkg.price / pkg.tokenAmount : 0
              const valueUnits = computeValueUnits({
                tokenAmount: pkg.tokenAmount,
                pricePerToken: pricingSettings.pricePerToken,
                lpPlans,
              })
              const isHighlight = pkg.isPopular
              return (
                <Card
                  key={pkg.id}
                  className={cn(
                    'relative flex flex-col overflow-visible rounded-xl border-warm-200 transition-all',
                    isHighlight &&
                      'scale-[1.02] border-2 border-primary-400 shadow-orange',
                  )}
                >
                  {isHighlight && (
                    <span className="absolute -top-3.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary-500 px-4 py-1 text-xs font-semibold text-white shadow-orange">
                      <Sparkles className="size-3" />
                      Paling Hemat
                    </span>
                  )}
                  <CardHeader>
                    <CardTitle className="font-display text-xl font-bold text-warm-900 dark:text-warm-50">
                      {pkg.name}
                    </CardTitle>
                    <CardDescription className="text-warm-500">
                      {formatNumber(pkg.tokenAmount)} token
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div>
                      <div className="font-display text-3xl font-extrabold text-warm-900 dark:text-warm-50 tabular-nums">
                        {formatRupiah(pkg.price)}
                      </div>
                      <div
                        className={cn(
                          'text-xs',
                          isHighlight
                            ? 'font-semibold text-primary-600'
                            : 'text-warm-500',
                        )}
                      >
                        {formatRupiah(Math.round(pricePerToken))} / token
                        {isHighlight && ' · termurah'}
                      </div>
                    </div>

                    {valueUnits.length > 0 && (
                      <div className="rounded-lg border border-warm-200 bg-warm-50/60 p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-warm-500">
                          Cukup buat
                        </div>
                        <ul className="space-y-1.5 text-sm">
                          {valueUnits.map((unit, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2 text-warm-700"
                            >
                              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                                <Check className="size-3" strokeWidth={3} />
                              </span>
                              <span className="flex-1">
                                {unit.label}
                                <span className="ml-1 font-semibold text-warm-900">
                                  {unit.value}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <ul className="space-y-1.5 text-xs text-warm-500">
                      <li className="flex items-start gap-2">
                        <span className="text-primary-500">·</span>
                        <span>Bisa dipakai untuk semua fitur Hulao</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary-500">·</span>
                        <span>Tanpa masa kedaluwarsa</span>
                      </li>
                    </ul>

                    <div className="mt-auto pt-2">
                      <Button
                        asChild
                        className={
                          isHighlight
                            ? 'w-full rounded-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600'
                            : 'w-full rounded-full border border-warm-200 bg-card font-semibold text-warm-800 hover:bg-warm-50'
                        }
                        variant={isHighlight ? 'default' : 'outline'}
                      >
                        <Link href={`/checkout/select/${pkg.id}`}>
                          {isHighlight ? 'Top-up Sekarang' : 'Pilih Paket'}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
