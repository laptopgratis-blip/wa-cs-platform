'use client'

// /pricing UI — toggle durasi + 4 plan card (FREE + 3 paid tiers).
// Client component karena interactive (toggle + redirect ke /upgrade).
import type { LpTier } from '@prisma/client'
import { Check, Crown, Sparkles, X, Zap } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
  DURATION_DISCOUNTS,
  calculateSubscriptionPriceFull,
  convertIdrToTokens,
} from '@/lib/subscription-pricing'
import { cn } from '@/lib/utils'

interface Pkg {
  id: string
  name: string
  description: string | null
  tier: LpTier
  maxLp: number
  maxStorageMB: number
  priceMonthly: number
  isPopular: boolean
}

interface Props {
  packages: Pkg[]
  isLoggedIn: boolean
  currentTier: string | null
  // Saldo token user — null kalau belum login. Dipakai untuk badge "saldo
  // cukup" / "kurang X token" di tiap kartu.
  currentBalance: number | null
  // Konversi IDR → token. Snapshot dari PricingSettings.pricePerToken aktif
  // saat page render. Default 2 (Rp 2/token).
  pricePerToken: number
}

const TIER_ICON: Record<string, typeof Sparkles> = {
  FREE: Sparkles,
  STARTER: Zap,
  POPULAR: Crown,
  POWER: Crown,
}

const FAQ = [
  {
    q: 'Bagaimana cara berlangganan?',
    a: 'Subscription LP dibayar pakai saldo token. Top-up token dulu di /billing (lewat Tripay BCA/QRIS/dll atau transfer manual), lalu pilih plan + durasi di /pricing. Token otomatis dipotong saat checkout dan akun langsung aktif — tidak perlu konfirmasi manual atau upload bukti transfer.',
  },
  {
    q: 'Kenapa pakai token, bukan langsung transfer?',
    a: 'Dengan token, user bisa upgrade/perpanjang LP kapan saja tanpa ribet input bukti transfer setiap kali. Token sama yang dipakai untuk AI reply, AI generate LP, dan optimasi LP — satu saldo untuk semua.',
  },
  {
    q: 'Apakah ada gratis trial?',
    a: 'Tidak ada trial. Tapi kamu bisa pakai plan FREE selamanya untuk fitur dasar.',
  },
  {
    q: 'Apa yang terjadi kalau subscription expired?',
    a: 'Akun otomatis turun ke plan FREE pada tanggal expired. Data tidak hilang — tapi kuota turun ke FREE (1 LP, 5 MB storage).',
  },
  {
    q: 'Bisa cancel kapan saja?',
    a: 'Ya, kamu bisa cancel kapan saja dari /billing/subscription. Akses tetap aktif sampai tanggal expired (tidak ada refund untuk sisa periode).',
  },
  {
    q: 'Bagaimana cara perpanjang?',
    a: 'Beli subscription baru sebelum tanggal expired. Sistem otomatis extend dari tanggal expired existing (bukan replace), jadi sisa hari kamu tetap aman.',
  },
  {
    q: 'Bagaimana cara upgrade ke plan lebih tinggi?',
    a: 'Beli plan baru dengan tier lebih tinggi. Subscription lama akan auto-expire saat plan baru aktif (no overlap).',
  },
]

export function PricingView({
  packages,
  isLoggedIn,
  currentTier,
  currentBalance,
  pricePerToken,
}: Props) {
  const router = useRouter()
  const [duration, setDuration] = useState<number>(1)

  const durationConfig = DURATION_DISCOUNTS.find((d) => d.months === duration)

  function handleSelect(pkg: Pkg) {
    if (!isLoggedIn) {
      // Redirect ke login dgn ?callbackUrl supaya setelah login balik ke upgrade.
      const callback = `/upgrade?plan=${pkg.id}&duration=${duration}`
      router.push(`/login?callbackUrl=${encodeURIComponent(callback)}`)
      return
    }
    router.push(`/upgrade?plan=${pkg.id}&duration=${duration}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <header className="space-y-3 text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">
          Pilih Plan untuk Bisnis Kamu
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Bayar di muka bulanan, semakin lama durasinya, semakin hemat.
          Cancel kapan saja, akses tetap sampai tanggal berakhir.
        </p>
      </header>

      {/* Toggle durasi */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap gap-1 rounded-full border bg-muted/30 p-1">
          {DURATION_DISCOUNTS.map((d) => (
            <button
              key={d.months}
              type="button"
              onClick={() => setDuration(d.months)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                duration === d.months
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {d.label}
              {d.badge && (
                <span
                  className={cn(
                    'ml-2 rounded-full px-1.5 py-0.5 text-[10px]',
                    duration === d.months
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 text-amber-700',
                  )}
                >
                  {d.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* FREE card — fixed, tidak dari DB */}
        <PlanCard
          icon={Sparkles}
          name="Free"
          description="Mulai gratis untuk eksplorasi."
          tier="FREE"
          features={{
            'Landing Page': '1',
            Storage: '5 MB',
            'Visitor / bulan': '1.000',
            'AI Generate': false,
            'Custom Domain': false,
            'Hulao Branding': true,
          }}
          priceLabel="Rp 0"
          ctaLabel={
            currentTier === 'FREE'
              ? 'Plan Aktif'
              : currentTier
                ? 'Plan Saat Ini Lebih Tinggi'
                : 'Mulai Gratis'
          }
          ctaDisabled={Boolean(currentTier)}
          ctaHref={isLoggedIn ? '/dashboard' : '/register'}
          highlight={false}
        />

        {packages.map((pkg) => {
          const calc = calculateSubscriptionPriceFull(
            pkg.priceMonthly,
            duration,
            pricePerToken,
          )
          const monthly = Math.round(calc.priceFinal / duration)
          const monthlyTokens = convertIdrToTokens(monthly, pricePerToken)
          const isCurrent = currentTier === pkg.tier
          // Untuk badge "saldo cukup / kurang X" — hanya tampil kalau user
          // sudah login (currentBalance != null). Public visitor lihat info
          // token saja tanpa badge saldo.
          const balanceStatus =
            currentBalance != null
              ? currentBalance >= calc.priceFinalTokens
                ? ('sufficient' as const)
                : ('insufficient' as const)
              : null
          return (
            <PlanCard
              key={pkg.id}
              icon={TIER_ICON[pkg.tier] ?? Crown}
              name={pkg.name}
              description={pkg.description ?? ''}
              tier={pkg.tier}
              features={{
                'Landing Page':
                  pkg.maxLp >= 999 ? 'Unlimited' : `${pkg.maxLp}`,
                Storage: `${pkg.maxStorageMB} MB`,
                'Visitor / bulan':
                  pkg.tier === 'STARTER'
                    ? '10.000'
                    : pkg.tier === 'POPULAR'
                      ? '50.000'
                      : '100.000',
                'AI Generate': true,
                'Custom Domain': pkg.tier !== 'STARTER',
                'Hulao Branding': false,
              }}
              priceLabel={`${calc.priceFinalTokens.toLocaleString('id-ID')} token`}
              priceSubLabel={`≈ ${monthlyTokens.toLocaleString('id-ID')} token/bulan · setara Rp ${calc.priceFinal.toLocaleString('id-ID')} (Rp ${monthly.toLocaleString('id-ID')}/bln)`}
              discountLabel={
                durationConfig && durationConfig.discountPct > 0
                  ? `Hemat ${durationConfig.discountPct}%`
                  : undefined
              }
              balanceStatus={balanceStatus}
              shortageTokens={
                balanceStatus === 'insufficient' && currentBalance != null
                  ? calc.priceFinalTokens - currentBalance
                  : undefined
              }
              ctaLabel={
                isCurrent
                  ? 'Plan Saat Ini'
                  : balanceStatus === 'insufficient'
                    ? 'Top-up dulu'
                    : `Pilih ${pkg.name}`
              }
              ctaDisabled={isCurrent}
              onClick={() => {
                if (balanceStatus === 'insufficient') {
                  router.push('/billing')
                  return
                }
                handleSelect(pkg)
              }}
              highlight={pkg.isPopular}
            />
          )
        })}
      </div>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl space-y-4 pt-6">
        <h2 className="text-center font-display text-2xl font-bold">
          Pertanyaan Umum
        </h2>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-lg border bg-card p-4"
            >
              <summary className="cursor-pointer list-none font-medium">
                <span className="mr-2 text-primary-500 group-open:rotate-45 inline-block transition-transform">
                  +
                </span>
                {item.q}
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}

interface PlanCardProps {
  icon: typeof Sparkles
  name: string
  description: string
  tier: string
  features: Record<string, string | boolean>
  priceLabel: string
  priceSubLabel?: string
  discountLabel?: string
  // Saldo status — null kalau user belum login (no badge), 'sufficient' kalau
  // saldo cukup, 'insufficient' kalau kurang (tampil shortageTokens).
  balanceStatus?: 'sufficient' | 'insufficient' | null
  shortageTokens?: number
  ctaLabel: string
  ctaDisabled?: boolean
  ctaHref?: string
  onClick?: () => void
  highlight?: boolean
}

function PlanCard({
  icon: Icon,
  name,
  description,
  features,
  priceLabel,
  priceSubLabel,
  discountLabel,
  balanceStatus,
  shortageTokens,
  ctaLabel,
  ctaDisabled,
  ctaHref,
  onClick,
  highlight,
}: PlanCardProps) {
  return (
    <Card
      className={cn(
        'relative flex flex-col',
        highlight && 'border-primary-500 shadow-orange ring-2 ring-primary-500/30',
      )}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary-500 text-white">Paling Populer</Badge>
        </div>
      )}
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-primary-500" />
          <CardTitle>{name}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="mb-4">
          <div className="font-display text-3xl font-extrabold">
            {priceLabel}
          </div>
          {priceSubLabel && (
            <div className="text-xs text-muted-foreground">{priceSubLabel}</div>
          )}
          {discountLabel && (
            <Badge
              variant="secondary"
              className="mt-1 bg-amber-100 text-amber-700"
            >
              {discountLabel}
            </Badge>
          )}
          {balanceStatus === 'sufficient' && (
            <Badge
              variant="secondary"
              className="ml-2 mt-1 bg-emerald-100 text-emerald-700"
            >
              Saldo cukup
            </Badge>
          )}
          {balanceStatus === 'insufficient' && shortageTokens != null && (
            <Badge
              variant="secondary"
              className="ml-2 mt-1 bg-rose-100 text-rose-700"
            >
              Kurang {shortageTokens.toLocaleString('id-ID')} token
            </Badge>
          )}
        </div>
        <ul className="mb-6 flex-1 space-y-2 text-sm">
          {Object.entries(features).map(([key, value]) => (
            <li key={key} className="flex items-start gap-2">
              {value === false ? (
                <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
              ) : (
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              )}
              <span
                className={cn(
                  'flex-1',
                  value === false && 'text-muted-foreground/60',
                )}
              >
                <span className="font-medium">{key}</span>
                {typeof value === 'string' && <>: {value}</>}
              </span>
            </li>
          ))}
        </ul>
        {ctaHref ? (
          <Button
            asChild
            disabled={ctaDisabled}
            className={cn(highlight && 'bg-primary-500 hover:bg-primary-600')}
          >
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        ) : (
          <Button
            onClick={onClick}
            disabled={ctaDisabled}
            className={cn(highlight && 'bg-primary-500 hover:bg-primary-600')}
          >
            {ctaLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
