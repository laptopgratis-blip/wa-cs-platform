'use client'

// Orchestrator AI optimization flow:
//   1. Tombol "Optimasi dengan AI" → klik → fetch estimate
//   2. Confirm dialog tampil cost breakdown — user OK → trigger optimize
//   3. Loading 30-60s — AI generate suggestions + rewritten HTML
//   4. Result dialog: suggestions list + diff preview iframe + Apply / Discard
//   5. Apply → POST /apply → toast sukses + onApplied callback (parent refresh)
//
// Kalau saldo tidak cukup, dialog langsung tampil pesan + tombol top-up.
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CostEstimate {
  htmlChars: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  providerCostUsd: number
  providerCostRp: number
  platformTokensCharge: number
  platformChargeRp: number
}

interface EstimateData {
  estimate: CostEstimate
  currentBalance: number
  sufficientBalance: boolean
  hasAnalytics: boolean
  signalsCount: number
}

interface Suggestion {
  title: string
  rationale: string
  impact: string
}

interface OptimizationResult {
  optimizationId: string
  suggestions: Suggestion[]
  focusAreas: string[]
  scoreBefore: number | null
  scoreAfter: number | null
  rewrittenHtml: string
  cost: {
    inputTokens: number
    outputTokens: number
    providerCostRp: number
    platformTokensCharged: number
  }
}

interface Props {
  lpId: string
  lpSlug: string
  onApplied?: () => void
}

interface UploadedAsset {
  id: string
  url: string
  filename: string
}

export function OptimizeFlow({ lpId, lpSlug, onApplied }: Props) {
  const [step, setStep] = useState<
    'idle' | 'estimating' | 'confirm' | 'running' | 'result' | 'applying'
  >('idle')
  const [estimate, setEstimate] = useState<EstimateData | null>(null)
  const [result, setResult] = useState<OptimizationResult | null>(null)
  // Asset upload state — kalau saran AI mention testimoni/foto/dll, user bisa
  // upload langsung di modal hasil. URL ditampil supaya user copy & paste ke
  // HTML preview sebelum apply, atau pakai sebagai referensi setelah apply
  // (tinggal edit di /landing-pages/<id>/edit).
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAsset[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('idle')
    setEstimate(null)
    setResult(null)
    setUploadedAssets([])
    setUploading(false)
  }

  async function handleAssetUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('lpId', lpId)
      const res = await fetch('/api/lp/images', { method: 'POST', body: fd })
      const j = await res.json()
      if (!j.success) {
        toast.error(j.error ?? 'Gagal upload')
        return
      }
      setUploadedAssets((prev) => [
        ...prev,
        {
          id: j.data.id,
          url: j.data.url,
          filename: j.data.originalName ?? j.data.filename,
        },
      ])
      toast.success('Foto ter-upload — URL siap dipakai')
    } catch {
      toast.error('Network error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(window.location.origin + url)
    toast.success('URL disalin')
  }

  // Deteksi suggestions yang mention asset (testimoni/foto/gambar/image).
  // Kalau ada match, tampilkan section upload prominent supaya user notice.
  const needsAssets =
    result?.suggestions.some((s) => {
      const text = `${s.title} ${s.rationale}`.toLowerCase()
      return /testimon|foto|gambar|image|screenshot|bukti|review|ulasan/i.test(text)
    }) ?? false

  async function startEstimate() {
    setStep('estimating')
    try {
      const res = await fetch(
        `/api/lp/${encodeURIComponent(lpId)}/optimize/estimate`,
        { cache: 'no-store' },
      )
      const j = await res.json()
      if (!j.success) {
        toast.error(j.error ?? 'Gagal hitung estimasi')
        setStep('idle')
        return
      }
      setEstimate(j.data as EstimateData)
      setStep('confirm')
    } catch {
      toast.error('Network error')
      setStep('idle')
    }
  }

  async function runOptimize() {
    setStep('running')
    try {
      const res = await fetch(
        `/api/lp/${encodeURIComponent(lpId)}/optimize`,
        { method: 'POST' },
      )
      const j = await res.json()
      if (!j.success) {
        toast.error(j.error ?? j.message ?? 'Gagal optimize')
        setStep('idle')
        return
      }
      setResult(j.data as OptimizationResult)
      setStep('result')
    } catch {
      toast.error('Network error / timeout')
      setStep('idle')
    }
  }

  async function applyOptimization() {
    if (!result) return
    setStep('applying')
    try {
      const res = await fetch(
        `/api/lp/${encodeURIComponent(lpId)}/optimize/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optimizationId: result.optimizationId }),
        },
      )
      const j = await res.json()
      if (!j.success) {
        toast.error(j.error ?? 'Gagal apply')
        setStep('result')
        return
      }
      toast.success('LP berhasil di-update dengan saran AI')
      reset()
      onApplied?.()
    } catch {
      toast.error('Network error')
      setStep('result')
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={startEstimate}
        disabled={step !== 'idle'}
        className="bg-purple-600 text-white shadow-sm hover:bg-purple-700"
      >
        {step === 'estimating' || step === 'running' ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Wand2 className="mr-1.5 size-4" />
        )}
        Optimasi dengan AI
      </Button>

      {/* Confirm dialog — cost breakdown */}
      <Dialog
        open={step === 'confirm' || step === 'running'}
        onOpenChange={(o) => {
          if (!o && step === 'confirm') reset()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <Sparkles className="mr-1 inline size-5 text-purple-600" />
              Optimasi LP dengan AI
            </DialogTitle>
            <DialogDescription>
              AI akan analisa LP berdasarkan data analytics + chat customer,
              lalu kasih saran perbaikan + HTML versi baru.
            </DialogDescription>
          </DialogHeader>

          {estimate && (
            <div className="space-y-3">
              <div className="rounded-lg border border-warm-200 bg-warm-50 p-3 text-sm">
                <div className="font-semibold text-warm-900">Konteks input AI:</div>
                <ul className="mt-1 space-y-0.5 text-xs text-warm-700">
                  <li>
                    • HTML LP saat ini:{' '}
                    <strong>
                      {(estimate.estimate.htmlChars / 1000).toFixed(1)}K karakter
                    </strong>
                  </li>
                  <li>
                    • Customer signals:{' '}
                    <strong>
                      {estimate.signalsCount > 0
                        ? `${estimate.signalsCount} pesan match`
                        : 'belum ada'}
                    </strong>
                  </li>
                  <li>
                    • Analytics:{' '}
                    <strong>
                      {estimate.hasAnalytics ? '30 hari terakhir' : 'belum ada visit'}
                    </strong>
                  </li>
                </ul>
              </div>

              <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-3">
                <div className="text-sm font-semibold text-purple-900">
                  Estimasi Biaya
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border bg-white p-2">
                    <div className="text-warm-500">Token AI provider</div>
                    <div className="font-mono text-sm font-bold text-warm-900">
                      ~{estimate.estimate.estimatedInputTokens.toLocaleString('id-ID')} in
                      <br />~{estimate.estimate.estimatedOutputTokens.toLocaleString('id-ID')} out
                    </div>
                  </div>
                  <div className="rounded border bg-white p-2">
                    <div className="text-warm-500">Biaya provider (Haiku 4.5)</div>
                    <div className="font-mono text-sm font-bold text-warm-900">
                      ~${estimate.estimate.providerCostUsd.toFixed(4)}
                      <br />
                      ~Rp {Math.round(estimate.estimate.providerCostRp).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>
                <div className="mt-2 rounded bg-purple-600 p-2.5 text-white">
                  <div className="text-[11px] opacity-80">
                    Token platform yang dipotong dari saldo:
                  </div>
                  <div className="font-mono text-lg font-bold">
                    {estimate.estimate.platformTokensCharge.toLocaleString('id-ID')} token
                    <span className="ml-2 text-sm opacity-75">
                      (Rp{' '}
                      {Math.round(estimate.estimate.platformChargeRp).toLocaleString('id-ID')}
                      )
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-purple-800">
                  Saldo kamu sekarang:{' '}
                  <strong className="tabular-nums">
                    {estimate.currentBalance.toLocaleString('id-ID')}
                  </strong>{' '}
                  token. Setelah optimasi:{' '}
                  <strong className="tabular-nums">
                    {(
                      estimate.currentBalance - estimate.estimate.platformTokensCharge
                    ).toLocaleString('id-ID')}
                  </strong>{' '}
                  token.
                </div>
              </div>

              {!estimate.sufficientBalance && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    Saldo tidak cukup. Top-up dulu sebelum lanjut.
                    <Link
                      href="/billing"
                      className="ml-1 font-semibold underline"
                    >
                      Top-up sekarang →
                    </Link>
                  </div>
                </div>
              )}

              {step === 'running' && (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-purple-200 bg-white p-4">
                  <Loader2 className="size-6 animate-spin text-purple-600" />
                  <div className="text-sm font-medium text-warm-900">
                    AI sedang analisa & generate perbaikan…
                  </div>
                  <div className="text-xs text-warm-500">
                    Haiku 4.5 — biasanya 25-60 detik (LP besar bisa lebih lama).
                    Jangan tutup tab ini.
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Batal
              </Button>
              <Button
                onClick={runOptimize}
                disabled={!estimate?.sufficientBalance}
                className="bg-purple-600 text-white hover:bg-purple-700"
              >
                <Wand2 className="mr-1.5 size-4" />
                Lanjutkan Optimasi
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Result dialog — suggestions + diff preview + apply/discard */}
      <Dialog
        open={step === 'result' || step === 'applying'}
        onOpenChange={(o) => {
          if (!o && step === 'result') {
            if (confirm('Discard hasil optimasi? Token sudah dipotong, tidak bisa di-undo.')) {
              reset()
            }
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl lg:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Hasil Optimasi AI</DialogTitle>
            <DialogDescription>
              Review saran perbaikan + preview HTML baru. Apply untuk replace LP
              (versi lama tersimpan, bisa di-restore).
            </DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-4">
              {/* Score before/after */}
              {result.scoreBefore != null && result.scoreAfter != null && (
                <div className="flex items-center justify-center gap-6 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
                  <ScoreBadge score={result.scoreBefore} label="Sekarang" color="warm" />
                  <div className="text-2xl text-warm-400">→</div>
                  <ScoreBadge
                    score={result.scoreAfter}
                    label="Estimasi setelah apply"
                    color="emerald"
                  />
                  <div className="text-sm font-bold text-emerald-700">
                    +{result.scoreAfter - result.scoreBefore} point
                  </div>
                </div>
              )}

              {/* Focus areas */}
              {result.focusAreas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-warm-500">
                    Focus:
                  </span>
                  {result.focusAreas.map((f) => (
                    <Badge key={f} variant="secondary" className="text-xs">
                      {f}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Suggestions */}
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold">
                  Saran Perbaikan ({result.suggestions.length})
                </h3>
                <ul className="space-y-2">
                  {result.suggestions.map((s, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-warm-200 p-3 text-sm"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-semibold text-warm-900">
                          {i + 1}. {s.title}
                        </div>
                        <Badge
                          className={
                            s.impact === 'high'
                              ? 'bg-rose-100 text-rose-800 hover:bg-rose-100'
                              : s.impact === 'medium'
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                                : 'bg-warm-100 text-warm-700 hover:bg-warm-100'
                          }
                        >
                          {s.impact}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-warm-600">{s.rationale}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Asset upload section — auto-prominent kalau saran mention foto/testimoni */}
              <div
                className={`rounded-lg border-2 p-3 ${
                  needsAssets
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-warm-200 bg-warm-50/50'
                }`}
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-warm-900">
                    <ImagePlus className="size-4 text-amber-700" />
                    Upload Aset (foto, testimoni, dll)
                    {needsAssets && (
                      <Badge className="bg-amber-200 text-amber-900 hover:bg-amber-200">
                        Disarankan
                      </Badge>
                    )}
                  </h3>
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleAssetUpload(f)
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant={needsAssets ? 'default' : 'outline'}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className={
                        needsAssets ? 'bg-amber-600 text-white hover:bg-amber-700' : ''
                      }
                    >
                      {uploading ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 size-4" />
                      )}
                      Upload Foto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      asChild
                    >
                      <Link
                        href={`/landing-pages/${lpId}/edit`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="mr-1.5 size-3.5" /> Image Library
                      </Link>
                    </Button>
                  </div>
                </div>
                <p className="mb-2 text-xs text-warm-600">
                  {needsAssets
                    ? 'Saran AI mention testimoni/foto. Upload sekarang lalu salin URL-nya — paste ke HTML preview di bawah (atau edit setelah apply).'
                    : 'Optional — upload aset tambahan kalau perlu (max 8MB per file, JPG/PNG/WebP/GIF).'}
                </p>
                {uploadedAssets.length > 0 && (
                  <ul className="space-y-1.5">
                    {uploadedAssets.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 rounded border border-warm-200 bg-white p-2 text-xs"
                      >
                        <img
                          src={a.url}
                          alt={a.filename}
                          className="size-10 shrink-0 rounded object-cover"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-warm-900">
                            {a.filename}
                          </div>
                          <div className="truncate font-mono text-[10px] text-warm-500">
                            {a.url}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => copyUrl(a.url)}
                        >
                          <Copy className="mr-1 size-3" /> Salin URL
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Preview iframe */}
              <div>
                <h3 className="mb-2 font-display text-sm font-semibold">
                  Preview HTML Baru
                </h3>
                <div className="rounded-lg border-2 border-warm-200 bg-warm-100 p-2">
                  <iframe
                    srcDoc={result.rewrittenHtml}
                    className="h-[480px] w-full rounded bg-white"
                    sandbox="allow-same-origin"
                    title="LP preview baru"
                  />
                </div>
              </div>

              {/* Cost summary */}
              <div className="rounded-lg border border-warm-200 bg-warm-50 p-2 text-[11px] text-warm-600">
                Cost actual: {result.cost.inputTokens.toLocaleString('id-ID')} in +{' '}
                {result.cost.outputTokens.toLocaleString('id-ID')} out token AI · Provider Rp{' '}
                {Math.round(result.cost.providerCostRp).toLocaleString('id-ID')} ·
                Token platform dipotong: {result.cost.platformTokensCharged.toLocaleString('id-ID')}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (
                  confirm(
                    'Discard hasil optimasi? Token sudah dipotong, tidak bisa di-undo.',
                  )
                ) {
                  reset()
                }
              }}
              disabled={step === 'applying'}
            >
              <X className="mr-1.5 size-4" /> Discard
            </Button>
            <Button
              onClick={() => void applyOptimization()}
              disabled={step === 'applying'}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {step === 'applying' ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 size-4" />
              )}
              Apply ke LP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ScoreBadge({
  score,
  label,
  color,
}: {
  score: number
  label: string
  color: 'warm' | 'emerald'
}) {
  const c =
    color === 'emerald' ? 'bg-emerald-600 text-white' : 'bg-warm-200 text-warm-900'
  return (
    <div className="text-center">
      <div className={`inline-flex size-14 items-center justify-center rounded-full ${c}`}>
        <span className="font-display text-lg font-bold tabular-nums">{score}</span>
      </div>
      <div className="mt-1 text-[11px] text-warm-600">{label}</div>
    </div>
  )
}
