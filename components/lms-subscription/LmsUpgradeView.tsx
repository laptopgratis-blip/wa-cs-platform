'use client'

// /upgrade-lms — single-step token checkout untuk plan LMS.
// Mirror /upgrade (LP) — sama pattern preview API + checkout atomic.
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DURATION_DISCOUNTS } from '@/lib/subscription-pricing'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Pkg {
  id: string
  name: string
  tier: 'FREE' | 'BASIC' | 'PRO' | 'UNLIMITED'
  description: string | null
  maxCourses: number
  maxLessonsPerCourse: number
  maxStudentsPerCourse: number
  priceMonthly: number
}

interface PreviewData {
  package: {
    id: string
    name: string
    tier: string
    maxCourses: number
    maxLessonsPerCourse: number
    maxStudentsPerCourse: number
    priceMonthly: number
  }
  durationMonths: number
  discountPct: number
  priceBase: number
  discountAmount: number
  priceIdr: number
  tokenAmount: number
  pricePerToken: number
  currentBalance: number
  sufficientBalance: boolean
  shortageTokens: number
}

function fmtLimit(v: number): string {
  return v < 0 ? '∞' : v.toLocaleString('id-ID')
}

export function LmsUpgradeView({
  pkg,
  initialDuration,
}: {
  pkg: Pkg
  initialDuration: number
}) {
  const router = useRouter()
  const [duration, setDuration] = useState(initialDuration)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingPreview(true)
    fetch(
      `/api/lms-subscription/preview?lmsPackageId=${encodeURIComponent(pkg.id)}&durationMonths=${duration}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.success && j.data) setPreview(j.data as PreviewData)
        else toast.error(j.error || 'Gagal load preview')
      })
      .catch((err) => {
        if (!cancelled) toast.error(`Gagal: ${(err as Error).message}`)
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false)
      })
    return () => {
      cancelled = true
    }
  }, [pkg.id, duration])

  async function handleCheckout() {
    if (!preview || !preview.sufficientBalance) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/lms-subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lmsPackageId: pkg.id,
          durationMonths: duration,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.message || json.error || 'Gagal aktivasi')
        return
      }
      const r = json.data
      toast.success(
        `${r.packageName} aktif! ${r.tokenAmount.toLocaleString('id-ID')} token dipotong, saldo ${r.remainingBalance.toLocaleString('id-ID')}.`,
      )
      router.push('/lms/courses')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        icon={GraduationCap}
        title={`Upgrade LMS ke ${pkg.name}`}
        description="Bayar pakai saldo token. Aktivasi instan, tanpa upload bukti transfer."
      />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div
            className={cn(
              'rounded-lg border p-4',
              TONES.brand.bg,
              TONES.brand.border,
            )}
          >
            <div className={cn('flex items-center gap-2', TONES.brand.text)}>
              <GraduationCap className="size-4" />
              <span className="font-semibold">Plan {pkg.name}</span>
              <StatusBadge tone="brand" label={pkg.tier} />
            </div>
            {pkg.description && (
              <p className={cn('mt-1 text-sm', TONES.brand.text)}>
                {pkg.description}
              </p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <Stat label="Course" value={fmtLimit(pkg.maxCourses)} />
              <Stat
                label="Lesson/course"
                value={fmtLimit(pkg.maxLessonsPerCourse)}
              />
              <Stat
                label="Student/course"
                value={fmtLimit(pkg.maxStudentsPerCourse)}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Durasi subscription
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DURATION_DISCOUNTS.map((d) => (
                <button
                  key={d.months}
                  type="button"
                  onClick={() => setDuration(d.months)}
                  className={cn(
                    'rounded-lg border-2 p-3 text-left transition',
                    duration === d.months
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-warm-200 hover:border-warm-300 bg-white',
                  )}
                >
                  <div className="text-sm font-semibold">{d.label}</div>
                  {d.badge && (
                    <div
                      className={cn(
                        'mt-0.5 text-xs font-medium',
                        TONES.success.text,
                      )}
                    >
                      {d.badge}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {loadingPreview && !preview ? (
            <div className="border-warm-200 text-warm-500 flex items-center justify-center gap-2 rounded-lg border bg-white p-6 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </div>
          ) : preview ? (
            <div className="space-y-3">
              <div className="border-warm-200 bg-warm-50 rounded-lg border p-4 text-sm">
                <div className="text-warm-900 font-semibold">Rincian biaya</div>
                <ul className="text-warm-700 mt-2 space-y-1 text-xs">
                  <li className="flex justify-between">
                    <span>
                      {pkg.priceMonthly.toLocaleString('id-ID')} × {duration}{' '}
                      bulan
                    </span>
                    <span className="tabular-nums">
                      Rp {preview.priceBase.toLocaleString('id-ID')}
                    </span>
                  </li>
                  {preview.discountPct > 0 && (
                    <li
                      className={cn('flex justify-between', TONES.success.text)}
                    >
                      <span>Diskon durasi {preview.discountPct}%</span>
                      <span className="tabular-nums">
                        − Rp {preview.discountAmount.toLocaleString('id-ID')}
                      </span>
                    </li>
                  )}
                  <li className="border-warm-200 text-warm-900 flex justify-between border-t pt-1 font-semibold">
                    <span>Total IDR</span>
                    <span className="tabular-nums">
                      Rp {preview.priceIdr.toLocaleString('id-ID')}
                    </span>
                  </li>
                </ul>
              </div>

              <div
                className={cn(
                  'rounded-lg border p-4',
                  preview.sufficientBalance
                    ? cn(TONES.success.bg, TONES.success.border)
                    : cn(TONES.danger.bg, TONES.danger.border),
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 rounded-lg p-2',
                      preview.sufficientBalance
                        ? TONES.success.solid
                        : TONES.danger.solid,
                    )}
                  >
                    <Coins className="size-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-warm-600 text-xs font-medium tracking-wide uppercase">
                      Akan dipotong dari saldo
                    </div>
                    <div className="text-warm-900 font-mono text-2xl font-semibold tabular-nums">
                      {preview.tokenAmount.toLocaleString('id-ID')} token
                    </div>
                    <div className="text-warm-600 mt-1 text-xs">
                      1 token = Rp{' '}
                      {preview.pricePerToken.toLocaleString('id-ID')}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <Wallet className="size-3.5" />
                      <span className="text-warm-700">Saldo kamu:</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {preview.currentBalance.toLocaleString('id-ID')} token
                      </span>
                    </div>
                    {preview.sufficientBalance ? (
                      <div className={cn('mt-1 text-xs', TONES.success.text)}>
                        Setelah aktivasi:{' '}
                        <span className="font-mono font-semibold">
                          {(
                            preview.currentBalance - preview.tokenAmount
                          ).toLocaleString('id-ID')}{' '}
                          token
                        </span>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'mt-2 flex items-start gap-2 text-xs',
                          TONES.danger.text,
                        )}
                      >
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          Kurang{' '}
                          <strong>
                            {preview.shortageTokens.toLocaleString('id-ID')}{' '}
                            token
                          </strong>
                          .{' '}
                          <Link
                            href="/billing"
                            className="font-semibold underline"
                          >
                            Top-up sekarang →
                          </Link>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-warm-200 text-warm-600 flex items-start gap-2 rounded-lg border bg-white p-3 text-xs">
                <ShieldCheck
                  className={cn('mt-0.5 size-3.5 shrink-0', TONES.success.text)}
                />
                <span>
                  Aktivasi instan setelah konfirmasi. Akses fitur LMS{' '}
                  {duration === 1
                    ? '1 bulan'
                    : duration === 12
                      ? '1 tahun'
                      : `${duration} bulan`}{' '}
                  sejak sekarang. Token tidak di-refund kalau cancel di tengah.
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/pricing-lms">Kembali</Link>
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={!preview || !preview.sufficientBalance || submitting}
            >
              {submitting ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Coins className="mr-1.5 size-4" />
              )}
              Bayar dengan Token
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-primary-700 text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className="text-primary-900 font-mono font-semibold">{value}</div>
    </div>
  )
}
