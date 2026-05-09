'use client'

// Riwayat Saran AI — list semua optimization records, expand per-record untuk
// lihat suggestions & focus areas. Kalau record punya hasil HTML tapi belum
// applied (user discard sebelumnya), tampil tombol "Apply Sekarang" yang
// langsung commit (tidak charge ulang token — sudah dipotong saat generate).
import {
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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

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

const IMPACT_COLOR: Record<string, string> = {
  high: 'bg-rose-100 text-rose-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-warm-100 text-warm-700',
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
    if (!confirm('Apply saran ini ke LP? HTML akan di-replace + versi sebelumnya di-snapshot.')) {
      return
    }
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
          <div className="flex items-center justify-center py-8 text-warm-500">
            <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
          </div>
        )}

        {!loading && records.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-warm-500">
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
                <li key={r.id} className="rounded-lg border border-warm-200">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    className="flex w-full items-start gap-3 p-3 text-left hover:bg-warm-50"
                  >
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                      <Sparkles className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {status === 'applied' && (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              <CheckCircle2 className="mr-0.5 size-3" /> Applied
                            </Badge>
                          )}
                          {status === 'pending' && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              Pending Apply
                            </Badge>
                          )}
                          {status === 'error' && (
                            <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                              <XCircle className="mr-0.5 size-3" /> Error
                            </Badge>
                          )}
                          {status === 'no_html' && (
                            <Badge variant="secondary">No HTML</Badge>
                          )}
                          <span className="text-xs text-warm-500">
                            {r.suggestions.length} saran ·{' '}
                            {r.scoreBefore != null && r.scoreAfter != null
                              ? `${r.scoreBefore} → ${r.scoreAfter}`
                              : '-'}
                          </span>
                        </div>
                        <span className="text-[11px] text-warm-500">
                          {formatRelative(r.createdAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-warm-600">
                        {r.focusAreas.slice(0, 4).join(' · ') || 'Tidak ada focus area'}
                      </div>
                      <div className="mt-0.5 text-[11px] text-warm-400">
                        {r.model} · Rp{' '}
                        {Math.round(r.providerCostRp).toLocaleString('id-ID')} provider
                        · {r.platformTokensCharged} token
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="mt-1 size-4 shrink-0 text-warm-400" />
                    ) : (
                      <ChevronDown className="mt-1 size-4 shrink-0 text-warm-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 border-t border-warm-100 bg-warm-50/50 p-3">
                      {r.errorMessage && (
                        <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900">
                          <strong>Error:</strong> {r.errorMessage}
                        </div>
                      )}
                      {r.suggestions.length === 0 ? (
                        <p className="text-xs italic text-warm-500">
                          Tidak ada saran tersimpan.
                        </p>
                      ) : (
                        <ol className="space-y-2">
                          {r.suggestions.map((s, i) => (
                            <li
                              key={i}
                              className="rounded border border-warm-200 bg-white p-2.5 text-xs"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <strong className="text-warm-900">
                                  {i + 1}. {s.title}
                                </strong>
                                <Badge
                                  className={
                                    IMPACT_COLOR[s.impact] ?? 'bg-warm-100 text-warm-700'
                                  }
                                >
                                  {s.impact}
                                </Badge>
                              </div>
                              <p className="mt-1 text-warm-600">{s.rationale}</p>
                            </li>
                          ))}
                        </ol>
                      )}
                      {r.canApply && (
                        <div className="flex items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-2.5">
                          <div className="text-xs text-amber-900">
                            Saran ini sudah di-generate &amp; bayar — bisa
                            di-apply kapan saja tanpa biaya tambahan.
                          </div>
                          <Button
                            size="sm"
                            onClick={() => void handleApply(r.id)}
                            disabled={applyingId === r.id}
                            className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            {applyingId === r.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="mr-1 size-3.5" /> Apply Sekarang
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      {r.applied && r.appliedAt && (
                        <p className="text-[11px] text-emerald-700">
                          ✓ Sudah di-apply {formatRelative(r.appliedAt)}
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
    </Dialog>
  )
}
