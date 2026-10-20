// Section harga (2026-05-08) — repositioning customer-centric.
// Tambah free tier highlight di atas paket token supaya orang baru tau
// bisa mulai gratis dulu. Pricing token simplified copy.
import { Check, Gift, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { loginRedirectHref } from '@/lib/auth-landing'
import { formatNumber, formatRupiah } from '@/lib/format'
import {
  type OrderSystemPlan,
  orderSystemPlanName,
  orderSystemPriceText,
} from '@/lib/landing-plan'
import { cn } from '@/lib/utils'

interface PricingProps {
  packages: {
    id: string
    name: string
    tokenAmount: number
    price: number
    isPopular: boolean
  }[]
  // Paket termurah ber-Sistem Order (DB) — null = teks tanpa angka harga.
  orderSystemPlan: OrderSystemPlan | null
}

export function Pricing({ packages, orderSystemPlan }: PricingProps) {
  const priceText = orderSystemPriceText(orderSystemPlan)
  return (
    <section id="harga" className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-warm-900 text-3xl font-extrabold tracking-tight md:text-4xl">
          Mulai gratis. Bayar saat udah ramai.
        </h2>
        <p className="text-warm-600 mt-3">
          Tidak ada subscription wajib. Beli token sekali pakai kapan saja —
          atau pakai paket gratis selamanya untuk mulai.
        </p>
      </div>

      {/* Free tier highlight */}
      <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 md:p-8">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
              <Gift className="size-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-warm-900 text-xl font-extrabold">
                  Paket Gratis
                </h3>
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-800 uppercase">
                  Selamanya
                </span>
              </div>
              <p className="text-warm-700 mt-1 text-sm">
                1 nomor WA terhubung · 1 slot landing page (paste HTML dari
                builder favorit kamu, mis. ChatGPT/Claude.ai) · 1.000
                visitor/bulan
              </p>
              <p className="text-warm-500 mt-1 text-xs">
                Catatan: balasan AI WA & generator LP in-app butuh saldo token —
                top up paket terkecil saat siap pakai.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="lg"
            className="rounded-full bg-emerald-600 px-7 font-semibold text-white hover:bg-emerald-700"
          >
            <Link href="/register">Daftar Gratis</Link>
          </Button>
        </div>
      </div>

      {/* Token packages */}
      <div className="mx-auto mt-10 max-w-2xl text-center">
        <h3 className="font-display text-warm-900 text-xl font-bold">
          Atau top up token saat butuh
        </h3>
        <p className="text-warm-600 mt-2 text-sm">
          1 token = 1 balasan AI. Beli sekali, tidak ada expired, semua model AI
          bisa dipakai.
        </p>
      </div>

      {packages.length === 0 ? (
        <Card className="border-warm-200 mx-auto mt-8 max-w-md rounded-xl">
          <CardContent className="text-warm-500 py-10 text-center text-sm">
            Paket sedang disusun. Cek lagi nanti.
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3 md:items-stretch">
          {packages.map((pkg) => {
            const pricePerToken =
              pkg.tokenAmount > 0 ? pkg.price / pkg.tokenAmount : 0
            return (
              <Card
                key={pkg.id}
                className={cn(
                  // overflow-visible — base Card pakai overflow-hidden default;
                  // tanpa override badge "Paling Populer" (-top-3.5) ke-clip.
                  'border-warm-200 bg-card relative flex flex-col overflow-visible rounded-xl transition-all',
                  pkg.isPopular &&
                    'border-primary-400 shadow-orange scale-[1.02] border-2',
                )}
              >
                {pkg.isPopular && (
                  <span className="bg-primary-500 shadow-orange absolute -top-3.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full px-4 py-1 text-xs font-semibold text-white">
                    <Sparkles className="size-3" />
                    Paling Populer
                  </span>
                )}
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-warm-900 text-xl font-bold">
                    {pkg.name}
                  </CardTitle>
                  <CardDescription className="text-warm-500">
                    {formatNumber(pkg.tokenAmount)} token
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-5">
                  <div>
                    <div className="font-display text-warm-900 text-4xl font-extrabold tabular-nums">
                      {formatRupiah(pkg.price)}
                    </div>
                    <div className="text-warm-500 mt-1 text-xs">
                      ≈ {formatRupiah(Math.round(pricePerToken))} per balasan AI
                    </div>
                  </div>
                  <ul className="text-warm-600 space-y-2.5 text-sm">
                    <li className="flex items-start gap-2.5">
                      <span className="bg-primary-100 text-primary-600 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span>{formatNumber(pkg.tokenAmount)} balasan AI</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="bg-primary-100 text-primary-600 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span>Semua model AI (Claude, Gemini, OpenAI)</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="bg-primary-100 text-primary-600 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span>Tidak ada expired, pakai kapan saja</span>
                    </li>
                  </ul>
                  <div className="mt-auto pt-2">
                    <Button
                      asChild
                      className={cn(
                        'w-full rounded-full font-semibold',
                        pkg.isPopular
                          ? 'bg-primary-500 shadow-orange hover:bg-primary-600 text-white'
                          : 'bg-card border-warm-200 text-warm-800 hover:bg-warm-50 border',
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

      <p className="text-warm-500 mt-10 text-center text-xs">
        Sistem Order (form order, ongkir otomatis, kelola pesanan) tersedia
        lewat langganan landing page mulai paket{' '}
        {orderSystemPlanName(orderSystemPlan)}
        {priceText && <> ({priceText}, dibayar pakai saldo token)</>} — tidak
        otomatis termasuk saat membeli paket token di atas.{' '}
        <Link
          href={loginRedirectHref('/pricing')}
          className="text-primary-600 hover:underline"
        >
          Lihat paket langganan
        </Link>
      </p>
    </section>
  )
}
