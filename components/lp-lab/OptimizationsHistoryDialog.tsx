'use client'

// Riwayat Saran AI — list semua optimization records, expand per-record untuk
// lihat suggestions & focus areas. Kalau record punya hasil HTML tapi belum
// applied (user discard sebelumnya), tampil tombol "Apply Sekarang" yang
// langsung commit (tidak charge ulang token — sudah dipotong saat generate).
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { TONES, type Tone } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Suggestion {
  title: string
  rationale: string
  impact: string
}

interface Optimization {
  id: string
  model: string
  suggestions: Suggestion[]
  focusAreas: string[]
  scoreBefore: number | null
  scoreAfter: number | null
  providerCostRp: number
  platformTokensCharged: number
  applied: boolean
  appliedAt: string | null
  canApply: boolean
  errorMessage: string | null
  createdAt: string
}

interface Props {
  lpId: string
  onApplied?: () => void
}

// Level impact saran (enum AI) → tone registry lib/ui-tones.ts.
const IMPACT_TONE: Record<string, Tone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

export function OptimizationsHistoryDialog({ lpId, onApplied }: Props) {
  const [open, setOpen] = useState(false)
  const [records, setRecords] = useState<Optimization[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/lp/${encodeURIComponent(lpId)}/optimizations`,
        { cache: 'no-store' },
      )
      const j = await res.json()
      if (j.success) setRecords(j.data.optimizations as Optimization[])
      else toast.error(j.error ?? 'Gagal load history')
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApply(optId: string) {
    setPendingApplyId(null)
    setApplyingId(optId)
    try {
      const res = await fetch(
        `/api/lp/${encodeURIComponent(lpId)}/optimize/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optimizationId: optId }),
        },
      )
      const j = await res.json()
      if (!j.success) {
        toast.error(j.error ?? 'Gagal apply')
        return
      }
      toast.success('Saran berhasil di-apply ke LP')
      await load()
      onApplied?.()
    } catch {
      toast.error('Network error')
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <History className="mr-1.5 size-4" /> Riwayat Saran AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Riwayat Saran AI</DialogTitle>
          <DialogDescription>
            Semua hasil optimasi AI tersimpan di sini. Saran yang belum di-apply
            (klik &ldquo;Discard&rdquo; sebelumnya) bisa di-apply kapan saja
            tanpa charge ulang.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="text-warm-500 flex items-center justify-center py-8">
            <Loader2 className="mr-2 size-4 animate-spin" /> Memuat…
          </div>
        )}

        {!loading && records.length === 0 && (
          <div className="text-warm-500 rounded-lg border border-dashed p-8 text-center text-sm">
            Belum ada riwayat optimasi AI. Klik &ldquo;Optimasi dengan AI&rdquo;
            di header untuk mulai.
          </div>
        )}

        {!loading && records.length > 0 && (
          <ul className="space-y-2">
            {records.map((r) => {
              const isExpanded = expandedId === r.id
              const status = r.errorMessage
                ? 'error'
                : r.applied
                  ? 'applied'
                  : r.canApply
                    ? 'pending'
                    : 'no_html'
              return (
                <li key={r.id} className="border-warm-200 rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    className="hover:bg-warm-50 flex w-full items-start gap-3 p-3 text-left"
                  >
                    <div className="bg-primary-50 text-primary-600 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Sparkles className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {status === 'applied' && (
                            <StatusBadge
                              tone="success"
                              icon={CheckCircle2}
                              label="Applied"
                            />
                          )}
                          {status === 'pending' && (
                            <StatusBadge tone="warning" label="Pending Apply" />
                          )}
                          {status === 'error' && (
                            <StatusBadge
                              tone="danger"
                              icon={XCircle}
                              label="Error"
                            />
                          )}
                          {status === 'no_html' && (
                            <StatusBadge tone="neutral" label="No HTML" />
                          )}
                          <span className="text-warm-500 text-xs">
                            {r.suggestions.length} saran ·{' '}
                            {r.scoreBefore != null && r.scoreAfter != null
                              ? `${r.scoreBefore} → ${r.scoreAfter}`
                              : '-'}
                          </span>
                        </div>
                        <span className="text-warm-500 text-xs">
                          {formatRelative(r.createdAt)}
                        </span>
                      </div>
                      <div className="text-warm-600 mt-0.5 truncate text-xs">
                        {r.focusAreas.slice(0, 4).join(' · ') ||
                          'Tidak ada focus area'}
                      </div>
                      <div className="text-warm-400 mt-0.5 text-xs">
                        {r.model} ·{' '}
                        {r.platformTokensCharged.toLocaleString('id-ID')} token
                        kepake
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="text-warm-400 mt-1 size-4 shrink-0" />
                    ) : (
                      <ChevronDown className="text-warm-400 mt-1 size-4 shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-warm-100 bg-warm-50/50 space-y-2 border-t p-3">
                      {r.errorMessage && (
                        <div
                          className={cn(
                            'rounded-md border p-2 text-xs',
                            TONES.danger.bg,
                            TONES.danger.border,
                            TONES.danger.text,
                          )}
                        >
                          <strong>Error:</strong> {r.errorMessage}
                        </div>
                      )}
                      {r.suggestions.length === 0 ? (
                        <p className="text-warm-500 text-xs italic">
                          Tidak ada saran tersimpan.
                        </p>
                      ) : (
                        <ol className="space-y-2">
                          {r.suggestions.map((s, i) => (
                            <li
                              key={i}
                              className="border-warm-200 bg-card rounded-md border p-2.5 text-xs"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <strong className="text-warm-900">
                                  {i + 1}. {s.title}
                                </strong>
                                <StatusBadge
                                  tone={IMPACT_TONE[s.impact] ?? 'neutral'}
                                  label={s.impact}
                                />
                              </div>
                              <p className="text-warm-600 mt-1">
                                {s.rationale}
                              </p>
                            </li>
                          ))}
                        </ol>
                      )}
                      {r.canApply && (
                        <div
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-md border p-2.5',
                            TONES.warning.bg,
                            TONES.warning.border,
                          )}
                        >
                          <div className={cn('text-xs', TONES.warning.text)}>
                            Saran ini sudah di-generate &amp; bayar — bisa
                            di-apply kapan saja tanpa biaya tambahan.
                          </div>
                          <Button
                            size="sm"
                            onClick={() => setPendingApplyId(r.id)}
                            disabled={applyingId === r.id}
                            className="shrink-0"
                          >
                            {applyingId === r.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="mr-1 size-3.5" /> Apply
                                Sekarang
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      {r.applied && r.appliedAt && (
                        <p
                          className={cn(
                            'flex items-center gap-1 text-xs',
                            TONES.success.text,
                          )}
                        >
                          <Check className="size-3" aria-hidden />
                          Sudah di-apply {formatRelative(r.appliedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>

      <ConfirmDialog
        open={pendingApplyId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingApplyId(null)
        }}
        title="Apply saran ini ke LP?"
        description="HTML akan di-replace + versi sebelumnya di-snapshot (bisa rollback)."
        confirmLabel="Ya, Apply"
        variant="default"
        onConfirm={() => {
          if (pendingApplyId) void handleApply(pendingApplyId)
        }}
      />
    </Dialog>
  )
}
