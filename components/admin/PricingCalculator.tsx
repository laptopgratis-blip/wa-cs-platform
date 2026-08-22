'use client'

// PricingCalculator — admin tool untuk audit margin per AI model + per AI Feature.
// Section A asumsi (form, persist localStorage), B tabel analisis per model
// (dengan tombol apply rekomendasi), C warning banner kalau ada surface rugi,
// D simulasi paket, E section "AI Features" (Content Studio dst) dengan
// breakdown margin & tombol "Set margin global" untuk apply ke semua sekaligus.
import { AlertTriangle, Check, Loader2, Wand2 } from 'lucide-react'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useEffect, useMemo, useState } from 'react'
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
import { Input } from '@/components/ui/input'
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
import { pricingMarginMeta, statusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface ModelRow {
  id: string
  name: string
  provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'
  costPerMessage: number // token platform yang dipotong user
  inputPricePer1M: number // USD per 1M input token (provider)
  outputPricePer1M: number // USD per 1M output token (provider)
}

interface PackageRow {
  id: string
  name: string
  tokenAmount: number
  price: number // IDR
  isPopular: boolean
}

interface AiFeatureRow {
  id: string
  featureKey: string
  displayName: string
  modelName: string
  inputPricePer1M: number
  outputPricePer1M: number
  platformMargin: number // multiplier 1.3 = +30%
  floorTokens: number
  capTokens: number
  isActive: boolean
}

interface Props {
  models: ModelRow[]
  packages: PackageRow[]
  aiFeatures: AiFeatureRow[]
}

interface Assumptions {
  inputTokens: number // token input rata-rata per pesan
  outputTokens: number // token output rata-rata per pesan
  usdToIdr: number // kurs USD ke IDR
  pricePerToken: number // harga jual platform per 1 token (IDR)
  marginTarget: number // target margin minimum (%)
}

const DEFAULTS: Assumptions = {
  inputTokens: 1600,
  outputTokens: 300,
  usdToIdr: 16000,
  pricePerToken: 2,
  marginTarget: 50,
}

const STORAGE_KEY = 'pricingCalc.v1'

type StatusKind = 'AMAN' | 'TIPIS' | 'RUGI'

function clampPositive(v: number, fallback: number): number {
  return Number.isFinite(v) && v >= 0 ? v : fallback
}

export function PricingCalculator({
  models: initialModels,
  packages,
  aiFeatures: initialFeatures,
}: Props) {
  const [models, setModels] = useState(initialModels)
  const [features, setFeatures] = useState(initialFeatures)
  const [a, setA] = useState<Assumptions>(DEFAULTS)
  const [hydrated, setHydrated] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  // State khusus section AI Features
  const [globalMargin, setGlobalMargin] = useState(1.3)
  const [marginScope, setMarginScope] = useState<'all' | 'active'>('active')
  const [applyingMargin, setApplyingMargin] = useState(false)
  const [marginConfirmOpen, setMarginConfirmOpen] = useState(false)

  // Hydrate dari localStorage di effect supaya tidak SSR-mismatch.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Assumptions>
        setA({ ...DEFAULTS, ...parsed })
      }
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a))
    } catch {
      // ignore
    }
  }, [a, hydrated])

  function setField<K extends keyof Assumptions>(k: K, v: number) {
    setA((prev) => ({ ...prev, [k]: clampPositive(v, prev[k]) }))
  }

  // Per-model breakdown.
  const breakdown = useMemo(() => {
    return models.map((m) => {
      // Biaya API per pesan dalam IDR.
      const apiCostUsd =
        (a.inputTokens * m.inputPricePer1M +
          a.outputTokens * m.outputPricePer1M) /
        1_000_000
      const apiCostIdr = apiCostUsd * a.usdToIdr

      // Pendapatan saat ini (IDR) = costPerMessage × harga_jual.
      const revenue = m.costPerMessage * a.pricePerToken
      const marginIdr = revenue - apiCostIdr
      const marginPct = revenue > 0 ? (marginIdr / revenue) * 100 : -Infinity

      // Token rekomendasi supaya margin >= target.
      // Rumus: ceil( apiCost / pricePerToken / (1 - target/100) )
      const targetFrac = a.marginTarget / 100
      const recommendedTokens =
        a.pricePerToken > 0 && targetFrac < 1 && targetFrac >= 0
          ? Math.max(
              1,
              Math.ceil(apiCostIdr / a.pricePerToken / (1 - targetFrac)),
            )
          : 0

      let status: StatusKind
      if (marginPct >= a.marginTarget) status = 'AMAN'
      else if (marginPct >= 20) status = 'TIPIS'
      else status = 'RUGI'

      return {
        ...m,
        apiCostIdr,
        revenue,
        marginIdr,
        marginPct,
        recommendedTokens,
        status,
      }
    })
  }, [models, a])

  const losers = breakdown.filter((b) => b.status === 'RUGI')
  // Loss per pesan = max(0, -marginIdr) supaya cuma yang benar-benar rugi.
  const totalLossPer1k =
    losers.reduce((sum, b) => sum + Math.max(0, -b.marginIdr), 0) * 1000

  async function applyRecommendation(modelId: string, recommended: number) {
    setApplyingId(modelId)
    try {
      const res = await fetch(`/api/admin/models/${modelId}/cost-per-message`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costPerMessage: recommended }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal apply rekomendasi')
        return
      }
      setModels((prev) =>
        prev.map((m) =>
          m.id === modelId ? { ...m, costPerMessage: recommended } : m,
        ),
      )
      toast.success('Token cost diperbarui')
    } catch {
      toast.error('Gagal apply rekomendasi')
    } finally {
      setApplyingId(null)
    }
  }

  // ── Per-feature breakdown (Content Studio dst) ───────────────────────
  // Beda dari AiModel: revenue di sini = tokensCharged × pricePerToken,
  // di mana tokensCharged = ceil(rawCostIdr × margin / pricePerToken)
  // diclamp ke [floor, cap]. Margin dipakai ke charge (BUKAN sekadar
  // diff antara cost & revenue), jadi profit = revenue - rawCost.
  const featureBreakdown = useMemo(() => {
    return features.map((f) => {
      const rawCostUsd =
        (a.inputTokens * f.inputPricePer1M +
          a.outputTokens * f.outputPricePer1M) /
        1_000_000
      const rawCostIdr = rawCostUsd * a.usdToIdr

      const desiredCharge = rawCostIdr * f.platformMargin
      const tokensRaw =
        a.pricePerToken > 0
          ? Math.ceil(desiredCharge / a.pricePerToken)
          : f.floorTokens
      // capTokens 0 = tidak di-enforce (skema fair-pricing, charge proporsional
      // ke atas tanpa batas). Backward compat: kalau > 0, tetap clamp.
      const baseCharge = Math.max(f.floorTokens, tokensRaw)
      const tokensCharged =
        f.capTokens > 0 ? Math.min(f.capTokens, baseCharge) : baseCharge
      const revenueIdr = tokensCharged * a.pricePerToken
      const profitIdr = revenueIdr - rawCostIdr
      const marginPct = revenueIdr > 0 ? (profitIdr / revenueIdr) * 100 : 0

      let status: StatusKind
      if (marginPct >= a.marginTarget) status = 'AMAN'
      else if (marginPct >= 20) status = 'TIPIS'
      else status = 'RUGI'

      return {
        ...f,
        rawCostIdr,
        tokensCharged,
        revenueIdr,
        profitIdr,
        marginPct,
        status,
      }
    })
  }, [features, a])

  const featureLosers = featureBreakdown.filter((b) => b.status === 'RUGI')

  // Apply margin global ke semua / hanya active features.
  async function applyGlobalMargin() {
    setMarginConfirmOpen(false)
    setApplyingMargin(true)
    try {
      const res = await fetch('/api/admin/ai-features/bulk-margin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margin: globalMargin, scope: marginScope }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { updated: number }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal apply margin')
        return
      }
      toast.success(`Margin diterapkan ke ${json.data.updated} feature`)
      // Optimistic: update state lokal supaya tabel langsung re-render.
      setFeatures((prev) =>
        prev.map((f) =>
          marginScope === 'all' || f.isActive
            ? { ...f, platformMargin: globalMargin }
            : f,
        ),
      )
    } catch {
      toast.error('Gagal apply margin')
    } finally {
      setApplyingMargin(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing Calculator"
        description={
          <>
            Hitung margin per AI model berdasarkan asumsi token & kurs. Apply
            rekomendasi langsung ke <code>costPerMessage</code> tiap model.
          </>
        }
      />

      {/* Section C — warning banner (gabung AiModel + AiFeature losers) */}
      {(losers.length > 0 || featureLosers.length > 0) && (
        <div
          role="alert"
          className={cn(
            'rounded-md border p-4',
            TONES.danger.bg,
            TONES.danger.border,
            TONES.danger.text,
          )}
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" />
            {losers.length + featureLosers.length} surface AI merugi!
          </p>
          {losers.length > 0 && (
            <p className="mt-0.5 text-sm">
              {losers.length} AI model (WA chat) — estimasi loss per 1.000
              pesan: <strong>{formatRupiah(totalLossPer1k)}</strong>
            </p>
          )}
          {featureLosers.length > 0 && (
            <p className="mt-0.5 text-sm">
              {featureLosers.length} AI feature (Content Studio dst) — atur
              margin di section bawah.
            </p>
          )}
        </div>
      )}

      {/* Section A — Asumsi */}
      <Card>
        <CardHeader>
          <CardTitle>Asumsi</CardTitle>
          <CardDescription>
            Disimpan otomatis di browser (localStorage).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="inputTokens">Token input / pesan</Label>
              <Input
                id="inputTokens"
                type="number"
                min={0}
                value={a.inputTokens}
                onChange={(e) =>
                  setField('inputTokens', Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="outputTokens">Token output / pesan</Label>
              <Input
                id="outputTokens"
                type="number"
                min={0}
                value={a.outputTokens}
                onChange={(e) =>
                  setField('outputTokens', Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="usdToIdr">Kurs USD/IDR</Label>
              <Input
                id="usdToIdr"
                type="number"
                min={0}
                value={a.usdToIdr}
                onChange={(e) => setField('usdToIdr', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pricePerToken">Harga jual / token (Rp)</Label>
              <Input
                id="pricePerToken"
                type="number"
                min={0}
                step="0.01"
                value={a.pricePerToken}
                onChange={(e) =>
                  setField('pricePerToken', Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="marginTarget">Target margin (%)</Label>
              <Input
                id="marginTarget"
                type="number"
                min={0}
                max={99}
                value={a.marginTarget}
                onChange={(e) =>
                  setField('marginTarget', Number(e.target.value))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B — Analisis Per Model */}
      <Card>
        <CardHeader>
          <CardTitle>Analisis Per Model</CardTitle>
          <CardDescription>
            Status hijau = margin ≥ target, kuning = 20% s/d target, merah = di
            bawah 20%.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">API Cost / pesan</TableHead>
                  <TableHead className="text-right">Token sekarang</TableHead>
                  <TableHead className="text-right">Pendapatan</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-right">
                    Token rekomendasi
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-normal">
                          {b.provider}
                        </Badge>
                        <span className="text-sm font-medium">{b.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(b.apiCostIdr)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(b.costPerMessage)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(b.revenue)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        b.marginPct < 20 && TONES.danger.text,
                        b.marginPct >= 20 &&
                          b.marginPct < a.marginTarget &&
                          TONES.warning.text,
                        b.marginPct >= a.marginTarget && TONES.success.text,
                      )}
                    >
                      {Number.isFinite(b.marginPct)
                        ? `${b.marginPct.toFixed(1)}%`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(b.recommendedTokens)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={statusMeta(pricingMarginMeta, b.status).tone}
                        label={statusMeta(pricingMarginMeta, b.status).label}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          applyingId === b.id ||
                          b.recommendedTokens === b.costPerMessage ||
                          b.recommendedTokens <= 0
                        }
                        onClick={() =>
                          applyRecommendation(b.id, b.recommendedTokens)
                        }
                      >
                        {applyingId === b.id && (
                          <Loader2 className="mr-1 size-3 animate-spin" />
                        )}
                        Apply
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {breakdown.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-muted-foreground py-12 text-center text-sm"
                    >
                      Belum ada model aktif.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section D — Simulasi Paket */}
      <Card>
        <CardHeader>
          <CardTitle>Simulasi Paket</CardTitle>
          <CardDescription>
            Estimasi jumlah pesan AI yang user dapat per paket × model (token
            paket ÷ <code>costPerMessage</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paket</TableHead>
                  <TableHead className="text-right">Token</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  {models.map((m) => (
                    <TableHead key={m.id} className="text-right">
                      {m.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {p.isPopular && (
                          <Badge variant="secondary" className="font-normal">
                            Popular
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(p.tokenAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(p.price)}
                    </TableCell>
                    {models.map((m) => {
                      const msgs =
                        m.costPerMessage > 0
                          ? Math.floor(p.tokenAmount / m.costPerMessage)
                          : 0
                      return (
                        <TableCell
                          key={m.id}
                          className="text-right text-sm tabular-nums"
                        >
                          {formatNumber(msgs)} pesan
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
                {packages.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3 + models.length}
                      className="text-muted-foreground py-12 text-center text-sm"
                    >
                      Belum ada paket aktif.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section E — AI Features (Content Studio dst) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="text-primary-500 size-5" />
            AI Features (Content Studio &amp; lainnya)
          </CardTitle>
          <CardDescription>
            Pricing per feature pakai <code>platformMargin</code> multiplier
            (1.3 = +30%). Tabel ini preview margin pakai asumsi token di atas.
            Kalau ada yang RUGI, naikkan margin di sini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bulk-margin control */}
          <div className="border-warm-200 bg-warm-50 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="globalMargin" className="text-xs">
                  Margin global (multiplier)
                </Label>
                <Input
                  id="globalMargin"
                  type="number"
                  step="0.05"
                  min={0.5}
                  max={10}
                  value={globalMargin}
                  onChange={(e) =>
                    setGlobalMargin(
                      clampPositive(Number(e.target.value), globalMargin),
                    )
                  }
                />
                <p className="text-warm-500 text-xs">
                  1.3 = +30% margin · 2.0 = +100% (2× cost API)
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Apply ke</Label>
                <Select
                  value={marginScope}
                  onValueChange={(v) => setMarginScope(v as 'all' | 'active')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Hanya feature aktif</SelectItem>
                    <SelectItem value="all">Semua feature</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => setMarginConfirmOpen(true)}
                disabled={applyingMargin || features.length === 0}
              >
                {applyingMargin && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                <Check className="mr-1.5 size-4" />
                Apply ke semua
              </Button>
            </div>
          </div>

          {/* Per-feature breakdown table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">API cost / call</TableHead>
                  <TableHead className="text-right">Margin (×)</TableHead>
                  <TableHead className="text-right">Token charge</TableHead>
                  <TableHead className="text-right">Pendapatan</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureBreakdown.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {b.displayName}
                        </span>
                        {!b.isActive && (
                          <Badge
                            variant="secondary"
                            className="bg-warm-100 text-warm-600 text-xs font-normal"
                          >
                            disabled
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {b.featureKey}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {b.modelName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(b.rawCostIdr)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.platformMargin.toFixed(2)}×
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(b.tokensCharged)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(b.revenueIdr)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        b.marginPct < 20 && TONES.danger.text,
                        b.marginPct >= 20 &&
                          b.marginPct < a.marginTarget &&
                          TONES.warning.text,
                        b.marginPct >= a.marginTarget && TONES.success.text,
                      )}
                    >
                      {b.marginPct.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={statusMeta(pricingMarginMeta, b.status).tone}
                        label={statusMeta(pricingMarginMeta, b.status).label}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {featureBreakdown.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-muted-foreground py-12 text-center text-sm"
                    >
                      Belum ada AI feature config. Buat di /admin/ai-features.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-warm-500 text-xs">
            💡 Edit per-feature (margin, floor, cap) di{' '}
            <a href="/admin/ai-features" className="text-primary-600 underline">
              /admin/ai-features
            </a>
            . Harga input/output otomatis sync dari{' '}
            <a href="/admin/ai-pricing" className="text-primary-600 underline">
              /admin/ai-pricing
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={marginConfirmOpen}
        onOpenChange={setMarginConfirmOpen}
        title={`Set platformMargin ${globalMargin}× ke ${marginScope === 'all' ? 'SEMUA feature' : 'feature aktif saja'}?`}
        description="Ini override margin per-feature yang sudah ada."
        confirmLabel="Ya, Terapkan"
        onConfirm={applyGlobalMargin}
      />
    </div>
  )
}
