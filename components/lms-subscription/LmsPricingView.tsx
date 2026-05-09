'use client'

import {
  Check,
  GraduationCap,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  tier: 'FREE' | 'BASIC' | 'PRO' | 'UNLIMITED'
  maxCourses: number
  maxLessonsPerCourse: number
  maxStudentsPerCourse: number
  maxFileStorageMB: number
  canUseDripSchedule: boolean
  canIssueCertificate: boolean
  priceMonthly: number
  isPopular: boolean
}

function fmtLimit(v: number): string {
  return v < 0 ? 'Unlimited' : v.toLocaleString('id-ID')
}

const TIER_RANK: Record<string, number> = {
  FREE: 0,
  BASIC: 1,
  PRO: 2,
  UNLIMITED: 3,
}

export function LmsPricingView({
  packages,
  currentTier,
  currentBalance,
  pricePerToken,
}: {
  packages: Pkg[]
  currentTier: string
  currentBalance: number
  pricePerToken: number
}) {
  const router = useRouter()
  const [duration, setDuration] = useState(1)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="text-center">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
          <GraduationCap className="size-3" />
          LMS Pricing
        </div>
        <h1 className="font-display text-3xl font-extrabold text-warm-900">
          Plan untuk LMS kamu
        </h1>
        <p className="mt-2 text-sm text-warm-600">
          Bayar pakai saldo token. Aktivasi instan, tanpa upload bukti
          transfer. Plan kamu sekarang:{' '}
          <Badge className="bg-warm-100 text-warm-800">{currentTier}</Badge>
        </p>
        <p className="mt-1 text-xs text-warm-500">
          Saldo:{' '}
          <span className="font-mono font-semibold">
            {currentBalance.toLocaleString('id-ID')} token
          </span>
          {' '}·{' '}
          <Link
            href="/billing"
            className="text-primary-600 underline hover:text-primary-700"
          >
            top-up
          </Link>
        </p>
      </header>

      {/* Duration selector */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-warm-200 bg-card p-1">
          {DURATION_DISCOUNTS.map((d) => (
            <button
              key={d.months}
              type="button"
              onClick={() => setDuration(d.months)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                duration === d.months
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-warm-600 hover:bg-warm-50',
              )}
            >
              {d.label}
              {d.discountPct > 0 && (
                <span className="ml-1 text-[10px] opacity-80">
                  −{d.discountPct}%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-warm-500">
            Belum ada plan LMS aktif. Admin perlu setup di /admin/lms-packages.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {packages.map((pkg) => {
            const calc = calculateSubscriptionPriceFull(
              pkg.priceMonthly,
              duration,
              pricePerToken,
            )
            const monthly = Math.round(calc.priceFinal / duration)
            const monthlyTokens = convertIdrToTokens(monthly, pricePerToken)
            const isCurrent = pkg.tier === currentTier
            const isLower = TIER_RANK[pkg.tier] < TIER_RANK[currentTier]
            const sufficient = currentBalance >= calc.priceFinalTokens
            return (
              <Card
                key={pkg.id}
                className={cn(
                  'relative flex flex-col overflow-visible rounded-xl border-warm-200 transition-all',
                  pkg.isPopular &&
                    'scale-[1.02] border-2 border-primary-400 shadow-orange',
                  isCurrent && 'ring-2 ring-emerald-300',
                )}
              >
                {pkg.isPopular && (
                  <span className="absolute -top-3.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary-500 px-4 py-1 text-xs font-semibold text-white shadow-orange">
                    <Sparkles className="size-3" />
                    Paling Populer
                  </span>
                )}
                {isCurrent && (
                  <Badge className="absolute -top-3 right-4 z-10 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Plan Kamu
                  </Badge>
                )}
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div>
                    <h3 className="font-display text-xl font-bold text-warm-900">
                      {pkg.name}
                    </h3>
                    {pkg.description && (
                      <p className="mt-1 text-xs text-warm-600">
                        {pkg.description}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="font-display text-2xl font-extrabold tabular-nums text-warm-900">
                      {calc.priceFinalTokens.toLocaleString('id-ID')} token
                    </div>
                    <div className="text-xs text-warm-500">
                      ≈ {monthlyTokens.toLocaleString('id-ID')}/bln · setara
                      Rp {calc.priceFinal.toLocaleString('id-ID')} ({duration}{' '}
                      bulan)
                    </div>
                  </div>

                  <ul className="space-y-1.5 text-xs text-warm-700">
                    <Feature on>
                      {fmtLimit(pkg.maxCourses)} course aktif
                    </Feature>
                    <Feature on>
                      {fmtLimit(pkg.maxLessonsPerCourse)} lesson per course
                    </Feature>
                    <Feature on>
                      {fmtLimit(pkg.maxStudentsPerCourse)} student per course
                    </Feature>
                    <Feature on>
                      {fmtLimit(pkg.maxFileStorageMB)} MB file storage
                    </Feature>
                    <Feature on={pkg.canUseDripSchedule}>
                      Drip schedule (Phase 4)
                    </Feature>
                    <Feature on={pkg.canIssueCertificate}>
                      Sertifikat completion (Phase 4)
                    </Feature>
                  </ul>

                  {!sufficient && !isCurrent && !isLower && (
                    <Badge className="mt-auto bg-rose-100 text-[11px] text-rose-700">
                      Kurang{' '}
                      {(
                        calc.priceFinalTokens - currentBalance
                      ).toLocaleString('id-ID')}{' '}
                      token
                    </Badge>
                  )}

                  <Button
                    className={cn(
                      'mt-auto w-full',
                      pkg.isPopular &&
                        'bg-primary-500 text-white hover:bg-primary-600',
                    )}
                    variant={pkg.isPopular ? 'default' : 'outline'}
                    disabled={isCurrent || isLower}
                    onClick={() => {
                      if (!sufficient) {
                        router.push('/billing')
                        return
                      }
                      router.push(
                        `/upgrade-lms?plan=${pkg.id}&duration=${duration}`,
                      )
                    }}
                  >
                    {isCurrent ? (
                      'Plan Saat Ini'
                    ) : isLower ? (
                      'Sudah di tier lebih tinggi'
                    ) : !sufficient ? (
                      'Top-up dulu'
                    ) : (
                      <>
                        <TrendingUp className="mr-1.5 size-4" />
                        Pilih {pkg.name}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Feature({
  on,
  children,
}: {
  on: boolean
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-2">
      {on ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
      ) : (
        <X className="mt-0.5 size-3.5 shrink-0 text-warm-300" />
      )}
      <span className={cn(!on && 'text-warm-400')}>{children}</span>
    </li>
  )
}
