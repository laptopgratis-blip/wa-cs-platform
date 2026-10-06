'use client'

// Dialog hasil optimasi AI — skor before/after, daftar saran, upload aset,
// preview HTML baru, biaya aktual, tombol Apply / Tutup.
//
// Diekstrak dari OptimizeFlow (2026-10-06) saat alur optimasi jadi background
// job, supaya file orchestrator tidak membengkak. Pasang dengan
// `key={result.optimizationId}` agar state upload aset reset per hasil.
import {
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import type { OptimizationResult } from '@/components/lp-lab/useOptimizeJob'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
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
import { fetchJson } from '@/lib/fetch-json'
import { TONES, type Tone } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

// Level impact saran (enum AI) → tone registry lib/ui-tones.ts.
const IMPACT_TONE: Record<string, Tone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

// Saran yang menyebut aset (testimoni/foto/dll) → section upload ditonjolkan.
const ASSET_HINT_RE =
  /testimon|foto|gambar|image|screenshot|bukti|review|ulasan/i

interface UploadedAsset {
  id: string
  url: string
  filename: string
}

interface Props {
  open: boolean
  lpId: string
  result: OptimizationResult | null
  applying: boolean
  onApply: () => void
  onDiscard: () => void
}

export function OptimizeResultDialog({
  open,
  lpId,
  result,
  applying,
  onApply,
  onDiscard,
}: Props) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !applying) setConfirmDiscard(true)
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
            <ScoreComparison result={result} />
            <FocusAreas focusAreas={result.focusAreas} />
            <SuggestionList result={result} />
            <AssetUploadSection lpId={lpId} result={result} />
            <HtmlPreview html={result.rewrittenHtml} />
            <ActualCost result={result} />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setConfirmDiscard(true)}
            disabled={applying}
          >
            <X className="mr-1.5 size-4" /> Tutup
          </Button>
          <Button onClick={onApply} disabled={applying}>
            {applying ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 size-4" />
            )}
            Apply ke LP
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Tutup hasil optimasi?"
        description="Token sudah dipotong. Hasil tetap tersimpan di Riwayat Saran AI dan bisa di-apply nanti tanpa biaya tambahan."
        confirmLabel="Ya, Tutup"
        variant="default"
        onConfirm={() => {
          setConfirmDiscard(false)
          onDiscard()
        }}
      />
    </Dialog>
  )
}

function ScoreComparison({ result }: { result: OptimizationResult }) {
  if (result.scoreBefore == null || result.scoreAfter == null) return null
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-6 rounded-lg border p-4',
        TONES.success.bg,
        TONES.success.border,
      )}
    >
      <ScoreBadge score={result.scoreBefore} label="Sekarang" color="warm" />
      <div className="text-warm-400 text-2xl">→</div>
      <ScoreBadge
        score={result.scoreAfter}
        label="Estimasi setelah apply"
        color="success"
      />
      <div className={cn('text-sm font-semibold', TONES.success.text)}>
        +{result.scoreAfter - result.scoreBefore} point
      </div>
    </div>
  )
}

function FocusAreas({ focusAreas }: { focusAreas: string[] }) {
  if (focusAreas.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-warm-500 text-xs font-medium">Focus:</span>
      {focusAreas.map((f) => (
        <Badge key={f} variant="secondary" className="text-xs">
          {f}
        </Badge>
      ))}
    </div>
  )
}

function SuggestionList({ result }: { result: OptimizationResult }) {
  return (
    <div>
      <h3 className="font-display mb-2 text-sm font-semibold">
        Saran Perbaikan ({result.suggestions.length})
      </h3>
      <ul className="space-y-2">
        {result.suggestions.map((s, i) => (
          <li key={i} className="border-warm-200 rounded-lg border p-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-warm-900 font-semibold">
                {i + 1}. {s.title}
              </div>
              <StatusBadge
                tone={IMPACT_TONE[s.impact] ?? 'neutral'}
                label={s.impact}
              />
            </div>
            <p className="text-warm-600 mt-1 text-xs">{s.rationale}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface UploadResponse {
  success: boolean
  data?: { id: string; url: string; originalName?: string; filename: string }
}

function AssetUploadSection({
  lpId,
  result,
}: {
  lpId: string
  result: OptimizationResult
}) {
  // Kalau saran AI mention testimoni/foto, user bisa upload langsung di sini
  // lalu salin URL-nya ke HTML (sebelum apply, atau edit setelah apply).
  const [assets, setAssets] = useState<UploadedAsset[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const needsAssets = result.suggestions.some((s) =>
    ASSET_HINT_RE.test(`${s.title} ${s.rationale}`),
  )

  async function handleUpload(file: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('lpId', lpId)
    const r = await fetchJson<UploadResponse>(
      '/api/lp/images',
      { method: 'POST', body: fd },
      'Gagal upload',
    )
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    const d = r.data?.data
    if (!r.ok || !d) {
      toast.error(r.error ?? 'Gagal upload')
      return
    }
    setAssets((prev) => [
      ...prev,
      { id: d.id, url: d.url, filename: d.originalName ?? d.filename },
    ])
    toast.success('Foto ter-upload — URL siap dipakai')
  }

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(window.location.origin + url)
    toast.success('URL disalin')
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        needsAssets
          ? cn(TONES.warning.bg, TONES.warning.border)
          : 'border-warm-200 bg-warm-50/50',
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-warm-900 flex items-center gap-1.5 text-sm font-semibold">
          <ImagePlus className="text-warm-600 size-4" />
          Upload Aset (foto, testimoni, dll)
          {needsAssets && <StatusBadge tone="warning" label="Disarankan" />}
        </h3>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleUpload(f)
            }}
          />
          <Button
            type="button"
            size="sm"
            variant={needsAssets ? 'default' : 'outline'}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 size-4" />
            )}
            Upload Foto
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
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
      <p className="text-warm-600 mb-2 text-xs">
        {needsAssets
          ? 'Saran AI mention testimoni/foto. Upload sekarang lalu salin URL-nya — paste ke HTML preview di bawah (atau edit setelah apply).'
          : 'Optional — upload aset tambahan kalau perlu (max 8MB per file, JPG/PNG/WebP/GIF).'}
      </p>
      {assets.length > 0 && (
        <ul className="space-y-1.5">
          {assets.map((a) => (
            <li
              key={a.id}
              className="border-warm-200 bg-card flex items-center gap-2 rounded-md border p-2 text-xs"
            >
              <img
                src={a.url}
                alt={a.filename}
                className="size-10 shrink-0 rounded object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <div className="text-warm-900 truncate font-medium">
                  {a.filename}
                </div>
                <div className="text-warm-500 truncate font-mono text-xs">
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
  )
}

function HtmlPreview({ html }: { html: string }) {
  return (
    <div>
      <h3 className="font-display mb-2 text-sm font-semibold">
        Preview HTML Baru
      </h3>
      <div className="border-warm-200 bg-warm-100 rounded-lg border p-2">
        <iframe
          srcDoc={html}
          className="h-[480px] w-full rounded bg-white"
          sandbox="allow-same-origin"
          title="LP preview baru"
        />
      </div>
    </div>
  )
}

function ActualCost({ result }: { result: OptimizationResult }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-xs',
        TONES.success.bg,
        TONES.success.border,
        TONES.success.text,
      )}
    >
      <div className="flex items-center gap-1 font-semibold">
        <Check className="size-3.5" aria-hidden />
        Biaya aktual (setelah AI selesai)
      </div>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        <div>
          <div className="text-xs opacity-80">Token AI diproses</div>
          <div className="font-mono font-bold">
            {result.cost.inputTokens.toLocaleString('id-ID')} in +{' '}
            {result.cost.outputTokens.toLocaleString('id-ID')} out
          </div>
        </div>
        <div>
          <div className="text-xs opacity-80">Token dipotong dari saldo</div>
          <div className="font-mono font-bold">
            {result.cost.platformTokensCharged.toLocaleString('id-ID')} token
          </div>
        </div>
      </div>
    </div>
  )
}

function ScoreBadge({
  score,
  label,
  color,
}: {
  score: number
  label: string
  color: 'warm' | 'success'
}) {
  const c =
    color === 'success' ? TONES.success.solid : 'bg-warm-200 text-warm-900'
  return (
    <div className="text-center">
      <div
        className={cn(
          'inline-flex size-14 items-center justify-center rounded-full',
          c,
        )}
      >
        <span className="font-display text-lg font-bold tabular-nums">
          {score}
        </span>
      </div>
      <div className="text-warm-600 mt-1 text-xs">{label}</div>
    </div>
  )
}
