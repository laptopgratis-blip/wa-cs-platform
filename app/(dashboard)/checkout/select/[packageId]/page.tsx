// Halaman pilih metode pembayaran — user pilih Tripay (payment gateway) atau
// Transfer Manual sebelum order dibuat.
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PaymentMethodPicker } from '@/components/dashboard/PaymentMethodPicker'
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
import { MESSAGE_CREDIT_BILLING_ENABLED } from '@/lib/billing/message-credit-mode'

export const dynamic = 'force-dynamic'

export default async function SelectPaymentPage({
  params,
}: {
  params: Promise<{ packageId: string }>
}) {
  const { packageId } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const pkg = await prisma.tokenPackage.findUnique({
    where: { id: packageId, isActive: true },
  })
  if (!pkg) notFound()
  // Paket Kredit Pesan tidak bisa dibeli selama billing kredit nonaktif
  // (lihat lib/billing/message-credit-mode.ts) — lindungi dari tautan langsung.
  if (pkg.kind === 'MESSAGE_CREDIT' && !MESSAGE_CREDIT_BILLING_ENABLED) notFound()

  const pricePerToken = pkg.tokenAmount > 0 ? pkg.price / pkg.tokenAmount : 0
  // Paket Kredit Pesan WA (Trek 2B): tokenAmount = Rp kredit yang diterima.
  const isCredit = pkg.kind === 'MESSAGE_CREDIT'

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
          title="Pilih Metode Pembayaran"
          description="Pilih cara bayar yang paling nyaman untuk kamu."
        />
      </div>

      <PostPublishReturnBanner />

      {/* Ringkasan paket */}
      <Card className="relative overflow-visible">
        {pkg.isPopular && (
          <Badge className="shadow-orange absolute -top-2.5 right-4 z-10">
            <Sparkles className="mr-1 size-3" />
            Paling Populer
          </Badge>
        )}
        <CardHeader className="pb-2">
          <CardDescription className="text-warm-500 text-xs font-medium tracking-wider uppercase">
            Paket yang dipilih
          </CardDescription>
          <CardTitle className="font-display text-warm-900 text-xl font-semibold">
            {pkg.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-warm-600 space-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              <span className="bg-primary-100 text-primary-600 flex size-4 shrink-0 items-center justify-center rounded-full">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {isCredit
                ? `Kredit Pesan WA ${formatRupiah(pkg.tokenAmount)} (untuk template Meta di nomor Cloud API)`
                : `${formatNumber(pkg.tokenAmount)} token siap pakai`}
            </li>
            <li className="flex items-center gap-2">
              <span className="bg-primary-100 text-primary-600 flex size-4 shrink-0 items-center justify-center rounded-full">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {isCredit
                ? 'Dipotong per pesan sesuai kategori (utility/marketing/OTP)'
                : 'Akses semua model AI yang aktif'}
            </li>
            <li className="flex items-center gap-2">
              <span className="bg-primary-100 text-primary-600 flex size-4 shrink-0 items-center justify-center rounded-full">
                <Check className="size-3" strokeWidth={3} />
              </span>
              Tanpa expired
            </li>
          </ul>

          <Separator />

          <div className="flex items-baseline justify-between">
            <span className="text-warm-500 text-sm">
              {isCredit
                ? `Harga ${Math.round((pkg.price / Math.max(pkg.tokenAmount, 1)) * 100)}% dari nilai kredit`
                : `≈ ${formatRupiah(Math.round(pricePerToken))} per token`}
            </span>
            <div className="text-right">
              <div className="font-display text-warm-900 text-2xl font-semibold tabular-nums">
                {formatRupiah(pkg.price)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Picker metode pembayaran */}
      <PaymentMethodPicker
        packageId={pkg.id}
        packageName={pkg.name}
        packagePrice={pkg.price}
      />
    </PageContainer>
  )
}
