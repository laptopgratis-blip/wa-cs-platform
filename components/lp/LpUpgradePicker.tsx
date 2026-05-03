'use client'

// LpUpgradePicker — grid 3 paket LP + 2 tombol bayar (Tripay & Manual) per kartu.
// Tombol disabled kalau user sudah di tier ini atau lebih tinggi.
import type { LpTier } from '@prisma/client'
import {
  Banknote,
  Check,
  CreditCard,
  HardDrive,
  Layers,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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

interface LpPkg {
  id: string
  name: string
  description: string | null
  tier: LpTier
  maxLp: number
  maxStorageMB: number
  price: number
  isPopular: boolean
}

const RANK: Record<LpTier, number> = {
  FREE: 0,
  STARTER: 1,
  POPULAR: 2,
  POWER: 3,
}

interface Props {
  currentTier: LpTier
  packages: LpPkg[]
}

export function LpUpgradePicker({ currentTier, packages }: Props) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleTripay(pkg: LpPkg) {
    setLoadingId(`${pkg.id}:tripay`)
    try {
      const res = await fetch('/api/lp/upgrade/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { orderId: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal memulai pembayaran')
        return
      }
      router.push(`/checkout/${json.data.orderId}`)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setLoadingId(null)
    }
  }

  async function handleManual(pkg: LpPkg) {
    setLoadingId(`${pkg.id}:manual`)
    try {
      const res = await fetch('/api/lp/upgrade/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { id: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal membuat order transfer manual')
        return
      }
      router.push(`/checkout/manual-lp/${json.data.id}`)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setLoadingId(null)
    }
  }

  if (packages.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Belum ada paket LP yang aktif. Hubungi admin.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {packages.map((pkg) => {
        const isCurrent = pkg.tier === currentTier
        const isLowerOrEqual = RANK[pkg.tier] <= RANK[currentTier]
        const tripayKey = `${pkg.id}:tripay`
        const manualKey = `${pkg.id}:manual`
        const isLoading = loadingId === tripayKey || loadingId === manualKey

        return (
          <Card
            key={pkg.id}
            className={cn(
              'relative flex flex-col rounded-xl border-warm-200 transition-all',
              pkg.isPopular &&
                'scale-[1.02] border-2 border-primary-400 shadow-orange',
              isCurrent && 'ring-2 ring-emerald-300',
            )}
          >
            {pkg.isPopular && (
              <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary-500 px-4 py-1 text-xs font-semibold text-white shadow-orange">
                <Sparkles className="size-3" />
                Paling Populer
              </span>
            )}
            {isCurrent && (
              <Badge className="absolute -top-3 right-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                Paket Kamu
              </Badge>
            )}
            <CardHeader>
              <CardTitle className="font-display text-xl font-bold text-warm-900 dark:text-warm-50">
                {pkg.name}
              </CardTitle>
              <CardDescription className="text-warm-500">
                {pkg.description ?? `Paket tier ${pkg.tier}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <div>
                <div className="font-display text-3xl font-extrabold text-warm-900 dark:text-warm-50 tabular-nums">
                  {formatRupiah(pkg.price)}
                </div>
                <div className="text-xs text-warm-500">sekali bayar</div>
              </div>

              <ul className="space-y-2.5 text-sm text-warm-600">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                    <Layers className="size-3" />
                  </span>
                  <span>
                    {pkg.maxLp >= 999
                      ? 'Unlimited Landing Page'
                      : `${formatNumber(pkg.maxLp)} Landing Page`}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                    <HardDrive className="size-3" />
                  </span>
                  <span>{pkg.maxStorageMB} MB storage gambar</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span>AI HTML generator + image library</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span>Custom slug & meta SEO</span>
                </li>
              </ul>

              <div className="mt-auto space-y-2 pt-2">
                <Button
                  onClick={() => void handleTripay(pkg)}
                  disabled={isLowerOrEqual || isLoading}
                  className={cn(
                    'w-full rounded-full font-semibold',
                    pkg.isPopular
                      ? 'bg-primary-500 text-white shadow-orange hover:bg-primary-600'
                      : 'bg-card border border-warm-200 text-warm-800 hover:bg-warm-50',
                  )}
                  variant={pkg.isPopular ? 'default' : 'outline'}
                >
                  {loadingId === tripayKey ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 size-4" />
                  )}
                  Bayar via Tripay
                </Button>
                <Button
                  onClick={() => void handleManual(pkg)}
                  disabled={isLowerOrEqual || isLoading}
                  variant="outline"
                  className="w-full rounded-full border-warm-200 bg-card font-medium text-warm-700 hover:bg-warm-50"
                >
                  {loadingId === manualKey ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Banknote className="mr-2 size-4" />
                  )}
                  Transfer Manual
                </Button>
                {isCurrent && (
                  <p className="text-center text-xs text-emerald-600">
                    Ini paket kamu sekarang
                  </p>
                )}
                {isLowerOrEqual && !isCurrent && (
                  <p className="text-center text-xs text-warm-500">
                    Kamu sudah di tier yang lebih tinggi
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
