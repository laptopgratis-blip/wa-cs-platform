'use client'

// InlineLmsSubscribe — list paket LMS aktif + 1-klik checkout pakai saldo
// token. Tidak fully replace halaman /pricing-lms (yang ada feature compare,
// duration toggle, dll), tapi cukup untuk onboarding pertama: pilih plan
// paling murah, klik Aktifkan, beres.
//
// Hardcode durationMonths=1 supaya commitment user awam minimal. Mau
// upgrade ke 6/12 bulan dari halaman lengkap nanti.

import {
  CheckCircle2,
  GraduationCap,
  Loader2,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { InlineTaskCommonProps } from './InlineTaskHost'

interface LmsPackage {
  id: string
  name: string
  description: string | null
  tier: 'FREE' | 'BASIC' | 'PRO' | 'UNLIMITED'
  maxCourses: number
  maxLessonsPerCourse: number
  priceMonthly: number
  isPopular: boolean
}

const DURATION_MONTHS = 1

export function InlineLmsSubscribe({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [packages, setPackages] = useState<LmsPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/lms-subscription/packages', {
          cache: 'no-store',
        })
        const json = (await res.json()) as {
          success: boolean
          data?: { packages: LmsPackage[] }
        }
        if (cancelled) return
        if (res.ok && json.success && json.data) {
          // Filter FREE (auto-aktif, tidak perlu checkout) + plan dengan
          // priceMonthly = 0 (belum di-konfigurasi admin).
          const paid = json.data.packages.filter(
            (p) => p.tier !== 'FREE' && p.priceMonthly > 0,
          )
          setPackages(paid)
          // Default pilih BASIC (paling murah) atau yang isPopular.
          const popular = paid.find((p) => p.isPopular)
          setSelectedId(popular?.id ?? paid[0]?.id ?? null)
        }
      } catch (err) {
        console.warn('[InlineLmsSubscribe packages]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCheckout() {
    if (submitting || !selectedId) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/lms-subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lmsPackageId: selectedId,
          durationMonths: DURATION_MONTHS,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { packageName: string; tokenAmount: number }
        error?: string
        message?: string
      }
      if (!res.ok || !json.success) {
        // Saldo token kurang → kasih CTA top-up.
        if (json.error === 'INSUFFICIENT_TOKEN') {
          toast.error(json.message || 'Saldo token tidak cukup', {
            action: {
              label: 'Top-up',
              onClick: () => {
                window.location.href = '/billing/checkout'
              },
            },
            duration: 8000,
          })
        } else {
          toast.error(json.message || json.error || 'Gagal checkout LMS')
        }
        setSubmitting(false)
        return
      }
      toast.success(
        `Plan ${json.data?.packageName ?? 'LMS'} aktif (–${json.data?.tokenAmount?.toLocaleString('id-ID') ?? '?'} token)`,
      )
      setDone(true)
      setTimeout(() => onCompleted(), 1200)
    } catch (err) {
      console.error('[InlineLmsSubscribe submit]', err)
      toast.error('Tidak bisa hubungi server')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Plan LMS aktif
        </p>
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-primary-200 bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
          <GraduationCap className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-bold text-warm-900">
            Pilih plan LMS
          </h3>
          <p className="mt-0.5 text-xs text-warm-600">
            Bayar pakai saldo token (durasi {DURATION_MONTHS} bulan). Bisa
            upgrade plan / extend durasi dari halaman pricing nanti.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-warm-500">
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          Memuat paket…
        </p>
      ) : packages.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Belum ada paket LMS aktif. Buka halaman pricing untuk info lebih
          lanjut.
        </p>
      ) : (
        <div className="space-y-2">
          {packages.map((p) => {
            const active = p.id === selectedId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition-all',
                  active
                    ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                    : 'border-warm-200 bg-warm-50 hover:border-warm-300',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold text-warm-900">
                      {p.name}
                    </span>
                    {p.isPopular && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        <Sparkles className="size-3" /> Populer
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-warm-600">
                    {p.description ??
                      `${p.maxCourses === -1 ? 'Unlimited' : p.maxCourses} course · ${p.maxLessonsPerCourse === -1 ? 'unlimited' : p.maxLessonsPerCourse} lesson/course`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-sm font-bold text-warm-900">
                    Rp {p.priceMonthly.toLocaleString('id-ID')}
                  </p>
                  <p className="text-[10px] text-warm-500">/ bulan</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleCheckout}
          disabled={submitting || !selectedId || packages.length === 0}
          className="bg-primary-500 hover:bg-primary-600"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Memproses…
            </>
          ) : (
            <>
              <Zap className="mr-2 size-4" />
              Aktifkan plan ({DURATION_MONTHS} bulan)
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
