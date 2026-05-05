// Halaman Riwayat Pembelian — daftar semua order Tripay (Payment) + Manual Payment
// dengan status, metode, jumlah, dan link ke detail checkout.
import type { ManualPaymentStatus, PaymentStatus } from '@prisma/client'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
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
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { authOptions } from '@/lib/auth'
import { formatNumber, formatRupiah } from '@/lib/format'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ─── Payment (Tripay) status maps ───

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Menunggu Pembayaran',
  SUCCESS: 'Sukses',
  FAILED: 'Gagal',
  EXPIRED: 'Expired',
  CANCELLED: 'Dibatalkan',
}

const PAYMENT_STATUS_VARIANT: Record<
  PaymentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  SUCCESS: 'default',
  FAILED: 'destructive',
  EXPIRED: 'outline',
  CANCELLED: 'outline',
}

const PAYMENT_STATUS_ICON: Record<PaymentStatus, typeof Clock> = {
  PENDING: Clock,
  SUCCESS: CheckCircle2,
  FAILED: XCircle,
  EXPIRED: XCircle,
  CANCELLED: XCircle,
}

// ─── Manual Payment status maps ───

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

const MANUAL_STATUS_ICON: Record<ManualPaymentStatus, typeof Clock> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  REJECTED: XCircle,
}

// Normalize QRIS variants ke "QRIS" saja.
function normalizePaymentName(name: string | null, code: string | null): string {
  if (code?.startsWith('QRIS')) return 'QRIS'
  return name ?? code ?? '—'
}

export default async function PurchaseHistoryPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [payments, manualPayments] = await Promise.all([
    prisma.payment.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderId: true,
        amount: true,
        tokenAmount: true,
        status: true,
        paymentMethod: true,
        paymentName: true,
        reference: true,
        paidAt: true,
        expiredAt: true,
        createdAt: true,
      },
    }),
    prisma.manualPayment.findMany({
      where: { userId: session.user.id, purpose: 'TOKEN_PURCHASE' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { package: { select: { name: true } } },
    }),
  ])

  const hasPayments = payments.length > 0
  const hasManual = manualPayments.length > 0
  const isEmpty = !hasPayments && !hasManual

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/billing">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Billing
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Riwayat Pembelian
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Semua riwayat pembelian token via Payment Gateway dan Transfer Manual.
        </p>
      </div>

      {isEmpty && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada riwayat pembelian.
          </CardContent>
        </Card>
      )}

      {/* ── Payment Gateway (Tripay) ── */}
      {hasPayments && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
            Payment Gateway
          </h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead className="hidden sm:table-cell">Tanggal</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const StatusIcon = PAYMENT_STATUS_ICON[p.status]
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={`/checkout/${p.orderId}`}
                          className="text-primary-600 hover:underline"
                        >
                          {p.orderId}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                        {p.createdAt.toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {normalizePaymentName(p.paymentName, p.paymentMethod)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupiah(p.amount)}
                      </TableCell>
                      <TableCell className="hidden text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400 sm:table-cell">
                        +{formatNumber(p.tokenAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={PAYMENT_STATUS_VARIANT[p.status]}
                          className="flex w-fit items-center gap-1"
                        >
                          <StatusIcon className="size-3" />
                          {PAYMENT_STATUS_LABEL[p.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/checkout/${p.orderId}`}>
                            Lihat
                            <ExternalLink className="ml-1.5 size-3" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Transfer Manual ── */}
      {hasManual && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
            Transfer Manual
          </h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paket</TableHead>
                  <TableHead className="hidden sm:table-cell">Tanggal</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manualPayments.map((mp) => {
                  const StatusIcon = MANUAL_STATUS_ICON[mp.status]
                  return (
                    <TableRow key={mp.id}>
                      <TableCell className="text-sm font-medium">
                        {mp.package?.name ?? '—'}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                        {mp.createdAt.toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupiah(mp.totalAmount)}
                      </TableCell>
                      <TableCell className="hidden text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400 sm:table-cell">
                        +{formatNumber(mp.tokenAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={MANUAL_STATUS_VARIANT[mp.status]}
                          className="flex w-fit items-center gap-1"
                        >
                          <StatusIcon className="size-3" />
                          {MANUAL_STATUS_LABEL[mp.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/checkout/manual/${mp.id}`}>
                            Lihat
                            <ExternalLink className="ml-1.5 size-3" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
