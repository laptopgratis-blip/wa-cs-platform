// Section harga — paket dari DB. Card "Paling Populer" punya scale + glow orange.
import { Check, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatNumber, formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'

interface PricingProps {
  packages: {
    id: string
    name: string
    tokenAmount: number
    price: number
    isPopular: boolean
  }[]
}

export function Pricing({ packages }: PricingProps) {
  return (
    <section id="harga" className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
          Bayar sesuai pakai
        </h2>
        <p className="mt-3 text-warm-600">
          Beli paket token sekali, pakai kapan saja — tanpa biaya bulanan, tanpa expired.
        </p>
      </div>

      {packages.length === 0 ? (
        <Card className="mx-auto mt-10 max-w-md rounded-xl border-warm-200">
          <CardContent className="py-10 text-center text-sm text-warm-500">
            Paket sedang disusun. Cek lagi nanti.
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3 md:items-stretch">
          {packages.map((pkg) => {
            const pricePerToken = pkg.tokenAmount > 0 ? pkg.price / pkg.tokenAmount : 0
            return (
              <Card
                key={pkg.id}
                className={cn(
                  'relative flex flex-col rounded-xl border-warm-200 bg-card transition-all',
                  pkg.isPopular &&
                    'scale-[1.02] border-2 border-primary-400 shadow-orange',
                )}
              >
                {pkg.isPopular && (
                  <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary-500 px-4 py-1 text-xs font-semibold text-white shadow-orange">
                    <Sparkles className="size-3" />
                    Paling Populer
                  </span>
                )}
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-xl font-bold text-warm-900">
                    {pkg.name}
                  </CardTitle>
                  <CardDescription className="text-warm-500">
                    {formatNumber(pkg.tokenAmount)} token
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-5">
                  <div>
                    <div className="font-display text-4xl font-extrabold text-warm-900 tabular-nums">
                      {formatRupiah(pkg.price)}
                    </div>
                    <div className="mt-1 text-xs text-warm-500">
                      ≈ {formatRupiah(Math.round(pricePerToken))} per token
                    </div>
                  </div>
                  <ul className="space-y-2.5 text-sm text-warm-600">
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span>{formatNumber(pkg.tokenAmount)} balasan AI</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span>Akses semua model AI</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span>Tanpa expired</span>
                    </li>
                  </ul>
                  <div className="mt-auto pt-2">
                    <Button
                      asChild
                      className={cn(
                        'w-full rounded-full font-semibold',
                        pkg.isPopular
                          ? 'bg-primary-500 text-white shadow-orange hover:bg-primary-600'
                          : 'bg-card border border-warm-200 text-warm-800 hover:bg-warm-50',
                      )}
                    >
                      <Link href="/register">Pilih Paket Ini</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
