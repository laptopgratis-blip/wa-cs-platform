// Halaman pilih metode pembayaran — user pilih Tripay (payment gateway) atau
// Transfer Manual sebelum order dibuat.
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PaymentMethodPicker } from '@/components/dashboard/PaymentMethodPicker'
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

  const pricePerToken = pkg.tokenAmount > 0 ? pkg.price / pkg.tokenAmount : 0

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
          Pilih Metode Pembayaran
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Pilih cara bayar yang paling nyaman untuk kamu.
        </p>
      </div>

      {/* Ringkasan paket */}
      <Card className="relative overflow-visible rounded-xl border-warm-200 shadow-sm">
        {pkg.isPopular && (
          <Badge className="absolute -top-2.5 right-4 z-10 bg-primary-500 text-white shadow-orange">
            <Sparkles className="mr-1 size-3" />
            Paling Populer
          </Badge>
        )}
        <CardHeader className="pb-2">
          <CardDescription className="text-xs font-medium uppercase tracking-wider text-warm-500">
            Paket yang dipilih
          </CardDescription>
          <CardTitle className="font-display text-xl font-bold text-warm-900 dark:text-warm-50">
            {pkg.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1.5 text-sm text-warm-600">
            <li className="flex items-center gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {formatNumber(pkg.tokenAmount)} token siap pakai
            </li>
            <li className="flex items-center gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                <Check className="size-3" strokeWidth={3} />
              </span>
              Akses semua model AI yang aktif
            </li>
            <li className="flex items-center gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                <Check className="size-3" strokeWidth={3} />
              </span>
              Tanpa expired
            </li>
          </ul>

          <Separator />

          <div className="flex items-baseline justify-between">
            <span className="text-sm text-warm-500">
              ≈ {formatRupiah(Math.round(pricePerToken))} per token
            </span>
            <div className="text-right">
              <div className="font-display text-2xl font-extrabold text-warm-900 dark:text-warm-50 tabular-nums">
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
    </div>
  )
}
