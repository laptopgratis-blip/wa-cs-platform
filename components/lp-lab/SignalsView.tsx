'use client'

// Signals tab — top customer concerns dari pesan WA, dengan sample quote.
// Manual refresh button supaya user bisa trigger recompute.
import { Loader2, MessageCircleWarning, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Signal {
  category: string
  label: string
  count: number
  samples: string[]
}

interface Props {
  lpId: string
}

const CATEGORY_COLOR: Record<string, string> = {
  harga_mahal: 'bg-rose-100 text-rose-800',
  gak_paham: 'bg-amber-100 text-amber-800',
  gak_percaya: 'bg-purple-100 text-purple-800',
  ragu_kualitas: 'bg-orange-100 text-orange-800',
  gak_yakin: 'bg-blue-100 text-blue-800',
  cocok_kebutuhan: 'bg-emerald-100 text-emerald-800',
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'belum pernah'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}

export function SignalsView({ lpId }: Props) {
  const [period, setPeriod] = useState<7 | 30 | 90>(30)
  const [signals, setSignals] = useState<Signal[]>([])
  const [computedAt, setComputedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/lp/${encodeURIComponent(lpId)}/signals?period=${period}`,
        { cache: 'no-store' },
      )
      const j = await res.json()
      if (j.success) {
        setSignals(j.data.signals)
        setComputedAt(j.data.computedAt)
      } else {
        toast.error(j.error ?? 'Gagal load signals')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }, [lpId, period])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch(
        `/api/lp/${encodeURIComponent(lpId)}/signals?period=${period}`,
        { method: 'POST' },
      )
      const j = await res.json()
      if (j.success) {
        toast.success(
          `Recompute: ${j.data.messagesScanned} pesan di-scan`,
        )
        await load()
      } else {
        toast.error(j.error ?? 'Gagal recompute')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setRefreshing(false)
    }
  }

  const totalSignals = signals.reduce((s, sig) => s + sig.count, 0)
  const sortedNonZero = signals.filter((s) => s.count > 0).sort((a, b) => b.count - a.count)

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircleWarning className="size-4 text-warm-600" />
            <h3 className="font-display text-sm font-semibold">
              Customer Concerns dari Chat WA
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 rounded-md border border-warm-300 bg-white p-0.5">
              {[7, 30, 90].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p as 7 | 30 | 90)}
                  className={`rounded px-2 py-0.5 text-xs ${
                    period === p
                      ? 'bg-primary-500 text-white'
                      : 'text-warm-600 hover:bg-warm-100'
                  }`}
                >
                  {p}d
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="h-7 px-2 text-xs"
            >
              {refreshing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="mr-1 size-3" />
                  Refresh
                </>
              )}
            </Button>
          </div>
        </div>

        <p className="text-xs text-warm-500">
          Signal di-bucketing dari pesan customer di {period} hari terakhir.
          Total {totalSignals} pesan match keyword. Update terakhir:{' '}
          {formatRelative(computedAt)}.
        </p>
        <p className="text-[11px] text-amber-700">
          ⚠️ Catatan: scope match adalah SEMUA chat user owner, belum filter
          per-LP precisely (Phase 3 limitation). Akurasi naik kalau pakai UTM
          source di link CTA tiap LP.
        </p>

        {loading && (
          <div className="flex items-center justify-center py-8 text-warm-500">
            <Loader2 className="mr-2 size-4 animate-spin" /> Memuat…
          </div>
        )}

        {!loading && sortedNonZero.length === 0 && (
          <div className="rounded border border-dashed border-warm-200 bg-warm-50 p-4 text-center text-xs text-warm-500">
            Belum ada signal kecocokan keyword. Bisa karena: (1) belum ada chat
            customer dalam {period} hari ini, atau (2) keyword bucket tidak
            cover bahasa yang dipakai customer.
          </div>
        )}

        {!loading && sortedNonZero.length > 0 && (
          <div className="space-y-3">
            {sortedNonZero.map((s) => (
              <div
                key={s.category}
                className="rounded-lg border border-warm-200 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge
                    className={`${
                      CATEGORY_COLOR[s.category] ?? 'bg-warm-100 text-warm-800'
                    } hover:${CATEGORY_COLOR[s.category] ?? 'bg-warm-100'}`}
                  >
                    {s.label}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums text-warm-900">
                    {s.count} pesan
                  </span>
                </div>
                {s.samples.length > 0 && (
                  <ul className="space-y-1 text-xs text-warm-700">
                    {s.samples.map((q, i) => (
                      <li
                        key={i}
                        className="border-l-2 border-warm-300 pl-2 italic text-warm-600"
                      >
                        &ldquo;{q}&rdquo;
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
