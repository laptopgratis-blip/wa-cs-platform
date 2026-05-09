'use client'

// /upgrade?plan=<lpPackageId>&duration=<months>
// Single-step token checkout. Subscription LP DI-BAYAR DENGAN TOKEN saldo
// (top-up token sendiri tetap pakai Tripay/Manual Transfer di /billing).
//
// Flow:
//   1. Pilih durasi (1/3/6/12 bulan, badge diskon)
//   2. Tampil cost breakdown: priceFinal IDR ↔ token equivalent + saldo
//   3. Insufficient → CTA top-up. Sufficient → tombol "Bayar dengan Token"
//   4. POST /api/subscription/checkout → instant ACTIVE → redirect ke billing
//
// Tidak ada step pembayaran/instruksi/upload bukti — semua atomic.
import type { LpTier } from '@prisma/client'
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DURATION_DISCOUNTS } from '@/lib/subscription-pricing'
import { cn } from '@/lib/utils'

interface Pkg {
  id: string
  name: string
  tier: LpTier
  description: string | null
  maxLp: number
  maxStorageMB: number
  priceMonthly: number
}

interface PreviewData {
  package: {
    id: string
    name: string
    tier: LpTier
    maxLp: number
    maxStorageMB: number
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

interface CheckoutResult {
  subscriptionId: string
  invoiceNumber: string
  packageName: string
  durationMonths: number
  priceIdr: number
  tokenAmount: number
  endDate: string
  remainingBalance: number
}

interface Props {
  pkg: Pkg
  initialDuration: number
}

export function UpgradeView({ pkg, initialDuration }: Props) {
  const router = useRouter()
  const [duration, setDuration] = useState(initialDuration)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Re-fetch preview tiap kali durasi berubah supaya cost breakdown akurat.
  useEffect(() => {
    let cancelled = false
    setLoadingPreview(true)
    fetch(
      `/api/subscription/preview?lpPackageId=${encodeURIComponent(pkg.id)}&durationMonths=${duration}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.success && j.data) setPreview(j.data as PreviewData)
        else toast.error(j.error || 'Gagal load preview harga')
      })
      .catch((err) => {
        if (!cancelled) toast.error(`Gagal load: ${(err as Error).message}`)
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
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lpPackageId: pkg.id,
          durationMonths: duration,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: CheckoutResult
        error?: string
        message?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.message || json.error || 'Gagal aktivasi subscription')
        return
      }
      const r = json.data
      toast.success(
        `${r.packageName} aktif! ${r.tokenAmount.toLocaleString('id-ID')} token dipotong, saldo ${r.remainingBalance.toLocaleString('id-ID')}.`,
      )
      router.push('/billing/subscription')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-extrabold">
          Upgrade ke {pkg.name}
        </h1>
        <p className="text-sm text-warm-600">
          Bayar pakai saldo token. Aktivasi instan, tidak ada konfirmasi
          manual atau upload bukti transfer.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-center gap-2 text-purple-900">
              <Sparkles className="size-4" />
              <span className="font-semibold">Paket {pkg.name}</span>
              <span className="rounded bg-purple-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-900">
                {pkg.tier}
              </span>
            </div>
            {pkg.description && (
              <p className="mt-1 text-sm text-purple-800">{pkg.description}</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-purple-900">
                <CheckCircle2 className="size-3.5" />
                {pkg.maxLp} landing page
              </div>
              <div className="flex items-center gap-1.5 text-purple-900">
                <CheckCircle2 className="size-3.5" />
                {pkg.maxStorageMB} MB storage
              </div>
            </div>
          </div>

          {/* Pilih durasi */}
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
                      : 'border-warm-200 bg-white hover:border-warm-300',
                  )}
                >
                  <div className="text-sm font-bold">{d.label}</div>
                  {d.badge && (
                    <div className="mt-0.5 text-[10px] font-medium text-emerald-700">
                      {d.badge}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Cost breakdown */}
          {loadingPreview && !preview ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-warm-200 bg-white p-6 text-sm text-warm-500">
              <Loader2 className="size-4 animate-spin" />
              Memuat estimasi...
            </div>
          ) : preview ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-warm-200 bg-warm-50 p-4 text-sm">
                <div className="font-semibold text-warm-900">
                  Rincian biaya
                </div>
                <ul className="mt-2 space-y-1 text-xs text-warm-700">
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
                    <li className="flex justify-between text-emerald-700">
                      <span>Diskon durasi {preview.discountPct}%</span>
                      <span className="tabular-nums">
                        − Rp {preview.discountAmount.toLocaleString('id-ID')}
                      </span>
                    </li>
                  )}
                  <li className="flex justify-between border-t border-warm-200 pt-1 font-semibold text-warm-900">
                    <span>Total IDR</span>
                    <span className="tabular-nums">
                      Rp {preview.priceIdr.toLocaleString('id-ID')}
                    </span>
                  </li>
                </ul>
              </div>

              <div
                className={cn(
                  'rounded-lg border-2 p-4',
                  preview.sufficientBalance
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-rose-300 bg-rose-50',
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 rounded-lg p-2',
                      preview.sufficientBalance
                        ? 'bg-emerald-200 text-emerald-900'
                        : 'bg-rose-200 text-rose-900',
                    )}
                  >
                    <Coins className="size-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium uppercase tracking-wide text-warm-600">
                      Akan dipotong dari saldo
                    </div>
                    <div className="font-mono text-2xl font-bold tabular-nums text-warm-900">
                      {preview.tokenAmount.toLocaleString('id-ID')} token
                    </div>
                    <div className="mt-1 text-xs text-warm-600">
                      Konversi 1 token = Rp{' '}
                      {preview.pricePerToken.toLocaleString('id-ID')} (kurs
                      platform)
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <Wallet className="size-3.5" />
                      <span className="text-warm-700">Saldo kamu:</span>
                      <span className="font-mono font-bold tabular-nums">
                        {preview.currentBalance.toLocaleString('id-ID')} token
                      </span>
                    </div>

                    {preview.sufficientBalance ? (
                      <div className="mt-1 text-xs text-emerald-700">
                        Setelah aktivasi:{' '}
                        <span className="font-mono font-semibold tabular-nums">
                          {(
                            preview.currentBalance - preview.tokenAmount
                          ).toLocaleString('id-ID')}{' '}
                          token
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-start gap-2 text-xs text-rose-900">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          Kurang{' '}
                          <strong>
                            {preview.shortageTokens.toLocaleString('id-ID')}{' '}
                            token
                          </strong>{' '}
                          (~Rp{' '}
                          {(
                            preview.shortageTokens * preview.pricePerToken
                          ).toLocaleString('id-ID')}
                          ).{' '}
                          <Link
                            href="/billing"
                            className="font-semibold underline"
                          >
                            Top-up token sekarang →
                          </Link>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-warm-200 bg-white p-3 text-xs text-warm-600">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span>
                  Aktivasi instan setelah konfirmasi. Akses fitur premium aktif{' '}
                  {duration === 1
                    ? '1 bulan'
                    : duration === 12
                      ? '1 tahun'
                      : `${duration} bulan`}{' '}
                  sejak sekarang. Sesuai policy SaaS, token tidak di-refund
                  kalau cancel di tengah periode.
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/pricing">Kembali ke Pricing</Link>
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={
                !preview || !preview.sufficientBalance || submitting
              }
              className="bg-primary-500 text-white hover:bg-primary-600"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Coins className="mr-1.5 size-4" />
                  Bayar dengan Token
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
