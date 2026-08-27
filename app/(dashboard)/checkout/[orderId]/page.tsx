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
import { PostPublishReturnBanner } from '@/components/onboarding/PostPublishReturnBanner'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
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
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

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

// Kelas dasar panel status di bawah rincian order; warnanya dari TONES.
const STATUS_PANEL = 'rounded-lg border p-4 text-sm'

// Channel REDIRECT — QRIS, E-Wallet (tidak perlu instruksi in-app).
const REDIRECT_CHANNELS = new Set([
  'QRIS',
  'QRISC',
  'QRIS2',
  'SHOPEEPAY',
  'OVO',
  'DANA',
])

// Normalize QRIS variants ke "QRIS" saja.
function normalizePaymentName(
  name: string | null,
  code: string | null,
): string {
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
  // Paket Kredit Pesan WA (Trek 2B) — label unit beda (Rp kredit, bukan token).
  const isCredit = payment.purpose === 'MESSAGE_CREDIT_PURCHASE'

  // Auto-tandai expired kalau lewat batas tapi masih PENDING.
  const isExpiredByTime =
    payment.status === 'PENDING' &&
    payment.expiredAt &&
    payment.expiredAt.getTime() < Date.now()
  const displayStatus: PaymentStatus = isExpiredByTime
    ? 'EXPIRED'
    : payment.status

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
    <PageContainer width="narrow">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link href="/billing">
            <ArrowLeft className="mr-2 size-4" />
            Kembali ke Billing
          </Link>
        </Button>
        <PageHeader
          title="Checkout"
          description={`Selesaikan pembayaran untuk menambah saldo ${
            isCredit ? 'kredit pesan WA' : 'token'
          }.`}
        />
      </div>

      <PostPublishReturnBanner
        paymentStatus={
          displayStatus === 'SUCCESS'
            ? 'COMPLETED'
            : displayStatus === 'PENDING'
              ? 'PENDING'
              : null
        }
      />

      {/* Auto-polling banner */}
      {displayStatus === 'PENDING' && (
        <CheckoutStatusPoller orderId={orderId} initialStatus={displayStatus} />
      )}

      <Card>
        <CardHeader className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-display text-warm-900 text-lg font-semibold">
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
          <div className="border-warm-200 bg-warm-50/50 rounded-lg border p-4">
            <div className="text-warm-500 text-xs font-medium tracking-wider uppercase">
              {isCredit ? 'Paket Kredit Pesan WA' : 'Paket Token'}
            </div>
            <div className="font-display text-warm-900 mt-1 text-xl font-semibold">
              {isCredit
                ? `Kredit ${formatRupiah(payment.tokenAmount)}`
                : `${formatNumber(payment.tokenAmount)} token`}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-warm-500">
                {isCredit ? 'Kredit diterima' : 'Jumlah Token'}
              </span>
              <span className="font-medium tabular-nums">
                {isCredit
                  ? formatRupiah(payment.tokenAmount)
                  : `${formatNumber(payment.tokenAmount)} token`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-warm-500">Metode Pembayaran</span>
              <span className="font-medium">
                {normalizePaymentName(
                  payment.paymentName,
                  payment.paymentMethod,
                )}
              </span>
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
              <span className="text-warm-700 font-medium">Total</span>
              <span className="font-display text-warm-900 text-lg font-semibold tabular-nums">
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

          {/* Status messages — warna panel lewat registry tone (lib/ui-tones). */}
          {displayStatus === 'SUCCESS' && (
            <div
              className={cn(
                STATUS_PANEL,
                TONES.success.border,
                TONES.success.bg,
                TONES.success.text,
              )}
            >
              Pembayaran sukses — saldo {isCredit ? 'kredit pesan' : 'token'}{' '}
              sudah masuk ke akun kamu.
            </div>
          )}
          {displayStatus === 'EXPIRED' && (
            <div
              className={cn(
                STATUS_PANEL,
                TONES.neutral.border,
                TONES.neutral.bg,
                TONES.neutral.text,
              )}
            >
              Order ini sudah expired. Silakan buat order baru dari halaman
              Billing.
            </div>
          )}
          {displayStatus === 'FAILED' && (
            <div
              className={cn(
                STATUS_PANEL,
                TONES.danger.border,
                TONES.danger.bg,
                TONES.danger.text,
              )}
            >
              Pembayaran gagal. Silakan buat order baru dari halaman Billing.
            </div>
          )}
          {displayStatus === 'CANCELLED' && (
            <div
              className={cn(
                STATUS_PANEL,
                TONES.neutral.border,
                TONES.neutral.bg,
                TONES.neutral.text,
              )}
            >
              Order ini dibatalkan. Silakan buat order baru dari halaman
              Billing.
            </div>
          )}
        </CardContent>
      </Card>

      {displayStatus === 'PENDING' && (
        <p className="text-warm-500 text-center text-xs">
          Setelah pembayaran selesai, halaman ini akan otomatis update status.
          Saldo {isCredit ? 'kredit pesan' : 'token'} akan langsung masuk ke
          akun kamu.
        </p>
      )}
    </PageContainer>
  )
}
