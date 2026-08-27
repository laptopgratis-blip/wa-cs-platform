'use client'

import { Check, GraduationCap, Sparkles, TrendingUp, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <PageContainer width="default">
      <PageHeader
        icon={GraduationCap}
        title="Plan untuk LMS kamu"
        description={
          <>
            <span className="inline-flex flex-wrap items-center gap-1">
              Bayar pakai saldo token. Aktivasi instan, tanpa upload bukti
              transfer. Plan kamu sekarang:
              <StatusBadge tone="brand" label={currentTier} />
            </span>
            <span className="mt-1 block text-xs">
              Saldo:{' '}
              <span className="font-mono font-semibold">
                {currentBalance.toLocaleString('id-ID')} token
              </span>{' '}
              ·{' '}
              <Link
                href="/billing"
                className="text-primary-600 hover:text-primary-700 underline"
              >
                top-up
              </Link>
            </span>
          </>
        }
      />

      {/* Duration selector */}
      <div className="flex justify-center">
        <div className="border-warm-200 bg-card inline-flex rounded-xl border p-1">
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
                <span className="ml-1 text-xs opacity-80">
                  −{d.discountPct}%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardContent className="text-warm-500 py-16 text-center text-sm">
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
                  // pt-4: badge "Paling Hemat/Populer" menggantung -top-3.5 dan
                  // menimpa judul kartu (terukur 10px). Headroom dikasih ke
                  // SEMUA kartu supaya judul antar-kartu tetap sejajar.
                  'relative flex flex-col overflow-visible pt-8 transition-all',
                  pkg.isPopular && 'ring-primary-400 scale-[1.02] ring-2',
                  // Plan aktif ditandai tint success + badge, bukan ring hue lepas.
                  isCurrent && TONES.success.bg,
                )}
              >
                {pkg.isPopular && (
                  <span className="bg-primary-500 absolute -top-3.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full px-4 py-1 text-xs font-semibold text-white">
                    <Sparkles className="size-3" />
                    Paling Populer
                  </span>
                )}
                {isCurrent && (
                  <StatusBadge
                    tone="success"
                    label="Plan Kamu"
                    className="absolute -top-3 right-4 z-10"
                  />
                )}
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div>
                    <h3 className="font-display text-warm-900 text-lg font-semibold">
                      {pkg.name}
                    </h3>
                    {pkg.description && (
                      <p className="text-warm-600 mt-1 text-xs">
                        {pkg.description}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="font-display text-warm-900 text-2xl font-semibold tabular-nums">
                      {calc.priceFinalTokens.toLocaleString('id-ID')} token
                    </div>
                    <div className="text-warm-500 text-xs">
                      ≈ {monthlyTokens.toLocaleString('id-ID')}/bln · setara Rp{' '}
                      {calc.priceFinal.toLocaleString('id-ID')} ({duration}{' '}
                      bulan)
                    </div>
                  </div>

                  <ul className="text-warm-700 space-y-1.5 text-xs">
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
                    <StatusBadge
                      tone="danger"
                      className="mt-auto"
                      label={`Kurang ${(calc.priceFinalTokens - currentBalance).toLocaleString('id-ID')} token`}
                    />
                  )}

                  <Button
                    className="mt-auto w-full"
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
    </PageContainer>
  )
}

function Feature({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {on ? (
        <Check className={cn('mt-0.5 size-3.5 shrink-0', TONES.success.text)} />
      ) : (
        <X className="text-warm-300 mt-0.5 size-3.5 shrink-0" />
      )}
      <span className={cn(!on && 'text-warm-400')}>{children}</span>
    </li>
  )
}
