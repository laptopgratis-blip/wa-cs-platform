'use client'

// PricingCalculator — admin tool untuk audit margin platform per AI model.
// Pilih paket token dari dropdown → harga per 1 token platform dihitung.
// Setiap model di-tampil:
//   provider cost (IDR per pesan), platform charge (token × harga/token),
//   margin per pesan (IDR & %), profit per 1000 pesan.
import { Calculator, Package, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ModelRow {
  id: string
  name: string
  provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'
  costPerMessage: number // token platform per pesan
  inputPricePer1M: number // IDR per 1M token (provider)
  outputPricePer1M: number
  avgTokensPerMessage: number
}

interface PackageRow {
  id: string
  name: string
  tokenAmount: number
  price: number // IDR
  isPopular: boolean
}

interface Props {
  models: ModelRow[]
  packages: PackageRow[]
}

// Hitung biaya provider per pesan AI dalam IDR (rata-rata input+output / 2).
function providerCostPerMessage(m: ModelRow): number {
  const avgPrice = (m.inputPricePer1M + m.outputPricePer1M) / 2
  return (m.avgTokensPerMessage / 1_000_000) * avgPrice
}

const PROVIDER_COLOR: Record<ModelRow['provider'], string> = {
  ANTHROPIC: 'bg-orange-100 text-orange-700',
  OPENAI: 'bg-emerald-100 text-emerald-700',
  GOOGLE: 'bg-blue-100 text-blue-700',
}

export function PricingCalculator({ models, packages }: Props) {
  const [selectedPkgId, setSelectedPkgId] = useState<string>(
    packages[0]?.id ?? '',
  )

  const selectedPkg = packages.find((p) => p.id === selectedPkgId) ?? packages[0]

  // Harga per 1 token platform di paket terpilih (IDR).
  const idrPerToken = useMemo(() => {
    if (!selectedPkg || selectedPkg.tokenAmount === 0) return 0
    return selectedPkg.price / selectedPkg.tokenAmount
  }, [selectedPkg])

  // Per-model breakdown.
  const breakdown = useMemo(() => {
    return models.map((m) => {
      const provCost = providerCostPerMessage(m)
      const platformCharge = m.costPerMessage * idrPerToken
      const margin = platformCharge - provCost
      const marginPct = platformCharge > 0 ? (margin / platformCharge) * 100 : 0
      const profitPer1k = margin * 1000
      return {
        ...m,
        provCost,
        platformCharge,
        margin,
        marginPct,
        profitPer1k,
      }
    })
  }, [models, idrPerToken])

  // Aggregated insights — max profit per pesan, min margin, dll.
  const insights = useMemo(() => {
    if (breakdown.length === 0) return null
    const sorted = [...breakdown].sort((a, b) => b.margin - a.margin)
    return {
      best: sorted[0],
      worst: sorted[sorted.length - 1],
      avgMargin:
        breakdown.reduce((s, m) => s + m.margin, 0) / breakdown.length,
    }
  }, [breakdown])

  if (packages.length === 0 || models.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Pricing Calculator
        </h1>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {models.length === 0 && 'Belum ada AI model aktif. '}
            {packages.length === 0 && 'Belum ada paket token aktif. '}
            Setup dulu di menu AI Models / Token Packages.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Pricing Calculator
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Audit margin platform per AI model di setiap paket token. Pilih paket
          untuk melihat berapa profit yang kamu dapat per pesan.
        </p>
      </div>

      {/* Selector paket */}
      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Package className="size-4 text-primary-500" />
            Pilih Paket Token
          </CardTitle>
          <CardDescription className="text-xs">
            Harga per token = harga paket / jumlah token. Dipakai untuk hitung
            charge ke user per pesan AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-select" className="text-xs">
              Paket
            </Label>
            <Select value={selectedPkgId} onValueChange={setSelectedPkgId}>
              <SelectTrigger id="pkg-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatNumber(p.tokenAmount)} token /{' '}
                    {formatRupiah(p.price)}
                    {p.isPopular ? ' ★' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-warm-500">Harga / token</div>
            <div className="font-display text-xl font-bold text-warm-900 dark:text-warm-50 tabular-nums">
              {formatRupiah(idrPerToken)}{' '}
              <span className="text-sm font-normal text-warm-500">
                / 1 token platform
              </span>
            </div>
          </div>
          {insights && (
            <div className="space-y-1.5">
              <div className="text-xs text-warm-500">Avg margin / pesan</div>
              <div
                className={cn(
                  'font-display text-xl font-bold tabular-nums',
                  insights.avgMargin >= 0 ? 'text-emerald-600' : 'text-destructive',
                )}
              >
                {insights.avgMargin >= 0 ? '+' : ''}
                {formatRupiah(insights.avgMargin)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Best/worst insights */}
      {insights && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="rounded-xl border-emerald-200 bg-emerald-50/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <TrendingUp className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-emerald-700">Margin tertinggi</div>
                <div className="font-display text-base font-bold text-emerald-900">
                  {insights.best?.name}
                </div>
                <div className="text-xs text-emerald-700">
                  +{formatRupiah(insights.best?.margin ?? 0)} ·{' '}
                  {insights.best?.marginPct.toFixed(1)}% margin
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-rose-200 bg-rose-50/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                <TrendingDown className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-rose-700">Margin terendah</div>
                <div className="font-display text-base font-bold text-rose-900">
                  {insights.worst?.name}
                </div>
                <div className="text-xs text-rose-700">
                  {insights.worst && insights.worst.margin >= 0 ? '+' : ''}
                  {formatRupiah(insights.worst?.margin ?? 0)} ·{' '}
                  {insights.worst?.marginPct.toFixed(1)}% margin
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Breakdown table */}
      <Card className="rounded-xl border-warm-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="size-4 text-primary-500" />
            Breakdown per Model
          </CardTitle>
          <CardDescription className="text-xs">
            Asumsi {models[0]?.avgTokensPerMessage ?? 500} token rata-rata per
            pesan (input + output digabung). Bisa disesuaikan per model di menu
            AI Models.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Cost provider</TableHead>
                <TableHead className="text-right">Token platform</TableHead>
                <TableHead className="text-right">Charge user</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">Profit / 1.000 pesan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map((m) => {
                const positive = m.margin >= 0
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            PROVIDER_COLOR[m.provider],
                          )}
                        >
                          {m.provider}
                        </span>
                        <span className="font-medium">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(Math.ceil(m.provCost * 100) / 100)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.costPerMessage}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(m.platformCharge)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        positive ? 'text-emerald-600' : 'text-destructive',
                      )}
                    >
                      {positive ? '+' : ''}
                      {formatRupiah(m.margin)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        positive ? 'text-emerald-600' : 'text-destructive',
                      )}
                    >
                      {m.marginPct.toFixed(1)}%
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        positive ? 'text-emerald-600' : 'text-destructive',
                      )}
                    >
                      {positive ? '+' : ''}
                      {formatRupiah(Math.round(m.profitPer1k))}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Help text */}
      <Card className="rounded-xl border-warm-200 bg-warm-50/50">
        <CardContent className="flex items-start gap-3 p-4 text-xs text-warm-600">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary-500" />
          <div className="space-y-1">
            <p>
              <strong>Cost provider</strong>: estimasi biaya yang kamu bayar ke
              Anthropic/OpenAI/Google per pesan (avgTokens × harga rata-rata).
            </p>
            <p>
              <strong>Charge user</strong>: token platform yang dipotong × harga
              per token di paket ini.
            </p>
            <p>
              <strong>Margin negatif</strong> = kamu rugi tiap pesan di model
              ini untuk paket ini. Naikkan <code>costPerMessage</code> di{' '}
              <em>AI Models</em>, atau naikkan harga paket di{' '}
              <em>Token Packages</em>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
