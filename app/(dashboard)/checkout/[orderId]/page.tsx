// Halaman checkout — tampil detail order + payment info (VA number / redirect button)
// + instruksi pembayaran + countdown timer + auto-polling status.
import type { PaymentStatus } from '@prisma/client'
import { ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { CheckoutStatusPoller } from '@/components/dashboard/CheckoutStatusPoller'
import { PaymentInfoCard } from '@/components/dashboard/PaymentInfoCard'
import { PaymentInstructions } from '@/components/dashboard/PaymentInstructions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { authOptions } from '@/lib/auth'
import { formatNumber, formatRupiah } from '@/lib/format'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Menunggu Pembayaran',
  SUCCESS: 'Sukses',
  FAILED: 'Gagal',
  EXPIRED: 'Expired',
  CANCELLED: 'Dibatalkan',
}

const STATUS_VARIANT: Record<
  PaymentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  SUCCESS: 'default',
  FAILED: 'destructive',
  EXPIRED: 'outline',
  CANCELLED: 'outline',
}

// Channel REDIRECT — QRIS, E-Wallet (tidak perlu instruksi in-app).
const REDIRECT_CHANNELS = new Set(['QRIS', 'QRISC', 'QRIS2', 'SHOPEEPAY', 'OVO', 'DANA'])

// Normalize QRIS variants ke "QRIS" saja.
function normalizePaymentName(name: string | null, code: string | null): string {
  if (code?.startsWith('QRIS')) return 'QRIS'
  return name ?? code ?? '—'
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const payment = await prisma.payment.findUnique({
    where: { orderId },
  })
  if (!payment) notFound()
  // Cegah user lain melihat order ini.
  if (payment.userId !== session.user.id) notFound()

  // Auto-tandai expired kalau lewat batas tapi masih PENDING.
  const isExpiredByTime =
    payment.status === 'PENDING' &&
    payment.expiredAt &&
    payment.expiredAt.getTime() < Date.now()
  const displayStatus: PaymentStatus = isExpiredByTime ? 'EXPIRED' : payment.status

  const StatusIcon =
    displayStatus === 'SUCCESS'
      ? CheckCircle2
      : displayStatus === 'PENDING'
        ? Clock
        : XCircle

  const canPay = displayStatus === 'PENDING'
  const isDirectChannel = payment.paymentMethod
    ? !REDIRECT_CHANNELS.has(payment.paymentMethod)
    : false

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/billing">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Billing
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Checkout
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Selesaikan pembayaran untuk menambah saldo token.
        </p>
      </div>

      {/* Auto-polling banner */}
      {displayStatus === 'PENDING' && (
        <CheckoutStatusPoller
          orderId={orderId}
          initialStatus={displayStatus}
        />
      )}

      <Card className="rounded-xl border-warm-200 shadow-sm">
        <CardHeader className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-display text-lg font-bold text-warm-900 dark:text-warm-50">
              Order #{orderId}
            </CardTitle>
            <Badge
              variant={STATUS_VARIANT[displayStatus]}
              className="flex items-center gap-1.5"
            >
              <StatusIcon className="size-3.5" />
              {STATUS_LABEL[displayStatus]}
            </Badge>
          </div>
          <CardDescription className="text-warm-500">
            Dibuat pada{' '}
            {payment.createdAt.toLocaleString('id-ID', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-warm-200 bg-warm-50/50 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-warm-500">
              Paket Token
            </div>
            <div className="mt-1 font-display text-xl font-bold text-warm-900 dark:text-warm-50">
              {formatNumber(payment.tokenAmount)} token
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-warm-500">Jumlah Token</span>
              <span className="font-medium tabular-nums">
                {formatNumber(payment.tokenAmount)} token
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-warm-500">Metode Pembayaran</span>
              <span className="font-medium">{normalizePaymentName(payment.paymentName, payment.paymentMethod)}</span>
            </div>
            {payment.expiredAt && displayStatus === 'PENDING' && (
              <div className="flex justify-between">
                <span className="text-warm-500">Berlaku Sampai</span>
                <span className="font-medium">
                  {payment.expiredAt.toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-base">
              <span className="font-medium text-warm-700">Total</span>
              <span className="font-display text-lg font-extrabold text-warm-900 dark:text-warm-50 tabular-nums">
                {formatRupiah(payment.amount)}
              </span>
            </div>
          </div>

          {/* Payment info — hybrid: DIRECT atau REDIRECT */}
          {canPay && (
            <PaymentInfoCard
              paymentMethod={payment.paymentMethod}
              paymentName={payment.paymentName}
              payCode={payment.payCode}
              paymentUrl={payment.paymentUrl}
              amount={payment.amount}
              expiredAt={payment.expiredAt?.toISOString() ?? null}
            />
          )}

          {/* Payment instructions — hanya untuk DIRECT channels */}
          {canPay && isDirectChannel && payment.paymentMethod && (
            <PaymentInstructions
              channelCode={payment.paymentMethod}
              payCode={payment.payCode}
            />
          )}

          {/* Status messages */}
          {displayStatus === 'SUCCESS' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Pembayaran sukses — saldo token sudah masuk ke akun kamu.
            </div>
          )}
          {displayStatus === 'EXPIRED' && (
            <div className="rounded-lg border border-warm-200 bg-warm-50 p-4 text-sm text-warm-700">
              Order ini sudah expired. Silakan buat order baru dari halaman Billing.
            </div>
          )}
          {displayStatus === 'FAILED' && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Pembayaran gagal. Silakan buat order baru dari halaman Billing.
            </div>
          )}
          {displayStatus === 'CANCELLED' && (
            <div className="rounded-lg border border-warm-200 bg-warm-50 p-4 text-sm text-warm-700">
              Order ini dibatalkan. Silakan buat order baru dari halaman Billing.
            </div>
          )}
        </CardContent>
      </Card>

      {displayStatus === 'PENDING' && (
        <p className="text-center text-xs text-warm-500">
          Setelah pembayaran selesai, halaman ini akan otomatis update status.
          Saldo token akan langsung masuk ke akun kamu.
        </p>
      )}
    </div>
  )
}
