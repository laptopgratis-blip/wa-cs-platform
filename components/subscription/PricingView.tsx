'use client'

// /pricing UI — toggle durasi + 4 plan card (FREE + 3 paid tiers).
// Client component karena interactive (toggle + redirect ke /upgrade).
import type { LpTier } from '@prisma/client'
import { Check, Crown, Sparkles, X, Zap } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PageContainer } from '@/components/shared/PageContainer'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DURATION_DISCOUNTS,
  calculateSubscriptionPriceFull,
  convertIdrToTokens,
} from '@/lib/subscription-pricing'
import { TONES } from '@/lib/ui-tones'
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
  // Kredit proration per tier target — sisa nilai subscription aktif user
  // yang ber-tier lebih rendah (dihitung server, mirror preview/checkout).
  // Kosong kalau belum login / tidak ada subscription aktif.
  upgradeCredits: Record<string, number>
  // Konversi IDR → token. Snapshot dari PricingSettings.pricePerToken aktif
  // saat page render. Default 2 (Rp 2/token).
  pricePerToken: number
  // Cap visitor per bulan per tier, dari lib/lp-quota.ts (sumber enforcement).
  // Jangan hardcode angka di sini — biar selalu sinkron dgn kuota asli.
  visitorCap: Record<string, number>
}

// Info untuk dialog "saldo kurang" — muncul saat user klik plan yang
// saldo-nya belum cukup (pengganti redirect diam-diam ke /billing yang
// bikin bingung: "kok Power tidak bisa dipilih?").
interface ShortageDialogInfo {
  pkgName: string
  durationLabel: string
  tokensDue: number
  creditTokens: number
  balance: number
  shortage: number
  pricePerToken: number
}

const TIER_ICON: Record<string, typeof Sparkles> = {
  FREE: Sparkles,
  STARTER: Zap,
  POPULAR: Crown,
  POWER: Crown,
}

// Urutan tier untuk menandai kartu downgrade — duplikat kecil dari
// TIER_RANK di lib/services/subscription.ts (file itu server-only karena
// import prisma; jangan di-import ke client component).
const TIER_ORDER: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  POPULAR: 2,
  POWER: 3,
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
    a: 'Beli plan baru dengan tier lebih tinggi. Sisa masa aktif plan lama otomatis dikreditkan sebagai potongan token saat checkout — tidak ada nilai yang hangus.',
  },
]

export function PricingView({
  packages,
  isLoggedIn,
  currentTier,
  currentBalance,
  upgradeCredits,
  pricePerToken,
  visitorCap,
}: Props) {
  const router = useRouter()
  const [duration, setDuration] = useState<number>(1)
  const [shortageInfo, setShortageInfo] = useState<ShortageDialogInfo | null>(
    null,
  )

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
    <PageContainer>
      <header className="space-y-3 text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Pilih Plan untuk Bisnis Kamu
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl">
          Bayar di muka bulanan, semakin lama durasinya, semakin hemat. Cancel
          kapan saja, akses tetap sampai tanggal berakhir.
        </p>
      </header>

      {/* Toggle durasi */}
      <div className="flex justify-center">
        <div className="bg-muted/30 inline-flex flex-wrap gap-1 rounded-full border p-1">
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
                    'ml-2 rounded-full px-1.5 py-0.5 text-xs',
                    duration === d.months
                      ? 'bg-white/20 text-white'
                      : 'bg-primary-100 text-primary-700',
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
            'Visitor / bulan': (visitorCap.FREE ?? 1000).toLocaleString(
              'id-ID',
            ),
            'AI Generate': true,
            'Host AI (Live Shopping)': false,
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
          // Downgrade diblokir backend (409 DOWNGRADE_BLOCKED) — kuota tidak
          // akan naik, jadi kartunya di-disable sekalian di sini.
          const isLower =
            currentTier != null &&
            (TIER_ORDER[pkg.tier] ?? 0) < (TIER_ORDER[currentTier] ?? 0)
          // Kredit proration (sisa subscription aktif tier lebih rendah) —
          // yang benar-benar dipotong = harga − kredit. Mirror preview API.
          const creditTokens = Math.min(
            upgradeCredits[pkg.tier] ?? 0,
            calc.priceFinalTokens,
          )
          const tokensDue = calc.priceFinalTokens - creditTokens
          // Untuk badge "saldo cukup / kurang X" — hanya tampil kalau user
          // sudah login (currentBalance != null). Public visitor lihat info
          // token saja tanpa badge saldo.
          const balanceStatus =
            currentBalance != null
              ? currentBalance >= tokensDue
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
                'Landing Page': pkg.maxLp >= 999 ? 'Unlimited' : `${pkg.maxLp}`,
                Storage: `${pkg.maxStorageMB} MB`,
                'Visitor / bulan': (visitorCap[pkg.tier] ?? 0).toLocaleString(
                  'id-ID',
                ),
                'AI Generate': true,
                // Host AI mulai paket Popular — samakan dgn gate di
                // lib/host-gen-gate.ts (hostTierAllowed).
                'Host AI (Live Shopping)':
                  pkg.tier === 'POPULAR' || pkg.tier === 'POWER',
              }}
              priceLabel={`${calc.priceFinalTokens.toLocaleString('id-ID')} token`}
              priceSubLabel={`≈ ${monthlyTokens.toLocaleString('id-ID')} token/bulan · setara Rp ${calc.priceFinal.toLocaleString('id-ID')} (Rp ${monthly.toLocaleString('id-ID')}/bln)`}
              creditLabel={
                creditTokens > 0
                  ? `Kredit upgrade −${creditTokens.toLocaleString('id-ID')} token (sisa plan aktif) → bayar ${tokensDue.toLocaleString('id-ID')} token`
                  : undefined
              }
              discountLabel={
                durationConfig && durationConfig.discountPct > 0
                  ? `Hemat ${durationConfig.discountPct}%`
                  : undefined
              }
              balanceStatus={balanceStatus}
              shortageTokens={
                balanceStatus === 'insufficient' && currentBalance != null
                  ? tokensDue - currentBalance
                  : undefined
              }
              ctaLabel={
                isCurrent
                  ? 'Plan Saat Ini'
                  : isLower
                    ? 'Plan Saat Ini Lebih Tinggi'
                    : balanceStatus === 'insufficient'
                      ? 'Top-up dulu'
                      : `Pilih ${pkg.name}`
              }
              ctaDisabled={isCurrent || isLower}
              onClick={() => {
                if (balanceStatus === 'insufficient') {
                  // Jangan diam-diam lempar ke /billing — jelaskan dulu
                  // kenapa & berapa kurangnya (incident customer 2026-07-11
                  // yang mengira Power "tidak bisa diklik").
                  setShortageInfo({
                    pkgName: pkg.name,
                    durationLabel: durationConfig?.label ?? `${duration} bulan`,
                    tokensDue,
                    creditTokens,
                    balance: currentBalance ?? 0,
                    shortage: tokensDue - (currentBalance ?? 0),
                    pricePerToken,
                  })
                  return
                }
                handleSelect(pkg)
              }}
              highlight={pkg.isPopular}
            />
          )
        })}
      </div>

      {/* Dialog saldo kurang */}
      <Dialog
        open={shortageInfo !== null}
        onOpenChange={(open) => {
          if (!open) setShortageInfo(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Saldo token belum cukup</DialogTitle>
            <DialogDescription>
              Paket {shortageInfo?.pkgName} ({shortageInfo?.durationLabel})
              butuh top-up dulu sebelum bisa diaktifkan.
            </DialogDescription>
          </DialogHeader>
          {shortageInfo && (
            <div className="bg-muted/30 space-y-1.5 rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span>
                  Biaya {shortageInfo.pkgName} {shortageInfo.durationLabel}
                </span>
                <span className="font-mono tabular-nums">
                  {shortageInfo.tokensDue.toLocaleString('id-ID')} token
                </span>
              </div>
              {shortageInfo.creditTokens > 0 && (
                <div className={cn('flex justify-between', TONES.success.text)}>
                  <span>Sudah termasuk kredit sisa plan aktif</span>
                  <span className="font-mono tabular-nums">
                    −{shortageInfo.creditTokens.toLocaleString('id-ID')}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Saldo kamu</span>
                <span className="font-mono tabular-nums">
                  {shortageInfo.balance.toLocaleString('id-ID')} token
                </span>
              </div>
              <div
                className={cn(
                  'flex justify-between border-t pt-1.5 font-semibold',
                  TONES.danger.text,
                )}
              >
                <span>Kurang</span>
                <span className="font-mono tabular-nums">
                  {shortageInfo.shortage.toLocaleString('id-ID')} token (~Rp{' '}
                  {(
                    shortageInfo.shortage * shortageInfo.pricePerToken
                  ).toLocaleString('id-ID')}
                  )
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShortageInfo(null)}>
              Pilih Durasi Lain
            </Button>
            <Button
              onClick={() => router.push('/billing')}
            >
              Top-up Token Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl space-y-4 pt-6">
        <h2 className="font-display text-center text-2xl font-semibold">
          Pertanyaan Umum
        </h2>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group bg-card rounded-lg border p-4"
            >
              <summary className="cursor-pointer list-none font-medium">
                <span className="text-primary-500 mr-2 inline-block transition-transform group-open:rotate-45">
                  +
                </span>
                {item.q}
              </summary>
              <p className="text-muted-foreground mt-3 text-sm">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </PageContainer>
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
  // Info kredit proration upgrade (mis. "Kredit upgrade −39.500 token ...").
  creditLabel?: string
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
  creditLabel,
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
        // overflow-visible — base Card pakai overflow-hidden yg memotong badge
        // "Paling Populer" (positioning -top-3 keluar dari card border).
        'relative flex flex-col overflow-visible',
        highlight && 'border-primary-500 ring-primary-500/30 ring-2',
      )}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
          <Badge>Paling Populer</Badge>
        </div>
      )}
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="text-primary-500 size-5" />
          <CardTitle>{name}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="mb-4">
          <div className="font-display text-3xl font-bold">{priceLabel}</div>
          {priceSubLabel && (
            <div className="text-muted-foreground text-xs">{priceSubLabel}</div>
          )}
          {creditLabel && (
            <div className={cn('mt-1 text-xs font-medium', TONES.success.text)}>
              {creditLabel}
            </div>
          )}
          {discountLabel && (
            <Badge
              variant="secondary"
              className="bg-primary-100 text-primary-700 mt-1"
            >
              {discountLabel}
            </Badge>
          )}
          {balanceStatus === 'sufficient' && (
            <Badge
              variant="secondary"
              className={cn('mt-1 ml-2', TONES.success.bg, TONES.success.text)}
            >
              Saldo cukup
            </Badge>
          )}
          {balanceStatus === 'insufficient' && shortageTokens != null && (
            <Badge
              variant="secondary"
              className={cn('mt-1 ml-2', TONES.danger.bg, TONES.danger.text)}
            >
              Kurang {shortageTokens.toLocaleString('id-ID')} token
            </Badge>
          )}
        </div>
        <ul className="mb-6 flex-1 space-y-2 text-sm">
          {Object.entries(features).map(([key, value]) => (
            <li key={key} className="flex items-start gap-2">
              {value === false ? (
                <X className="text-muted-foreground/40 mt-0.5 size-4 shrink-0" />
              ) : (
                <Check
                  className={cn('mt-0.5 size-4 shrink-0', TONES.success.text)}
                />
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
          >
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        ) : (
          <Button
            onClick={onClick}
            disabled={ctaDisabled}
          >
            {ctaLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
