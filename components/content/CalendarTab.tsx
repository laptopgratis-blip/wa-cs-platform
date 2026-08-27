'use client'

// Calendar view — month grid 7×6 dengan piece distribution per tanggal.
// Click tanggal → list piece di hari itu, dengan opsi unschedule.
//
// Bukan auto-publish — purely planning view.
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { contentPieceStatusMeta } from '@/lib/status'

interface Piece {
  id: string
  title: string
  channel: string
  funnelStage: string
  status: string
  scheduledFor: string
}

const CHANNEL_LABEL: Record<string, string> = {
  WA_STATUS: 'WA Status',
  IG_STORY: 'IG Story',
  IG_POST: 'IG Post',
  IG_CAROUSEL: 'IG Carousel',
  IG_REELS: 'IG Reels',
  TIKTOK: 'TikTok',
}

// Dot per channel — palet kategorikal chart (var(--chart-N)), bukan hue
// dekoratif lepas. TikTok pakai warm sebagai slot ke-6.
const CHANNEL_DOT: Record<string, string> = {
  WA_STATUS: 'bg-chart-1',
  IG_STORY: 'bg-chart-3',
  IG_POST: 'bg-chart-4',
  IG_CAROUSEL: 'bg-chart-2',
  IG_REELS: 'bg-chart-5',
  TIKTOK: 'bg-warm-700',
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const MONTH_LABELS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export function CalendarTab() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() } // month 0-indexed
  })
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null) // YYYY-MM-DD

  // Build month grid: 6 rows × 7 cols. Cells include trailing days from prev
  // month (untuk supaya senin/minggu pertama align) + leading days of next month.
  const grid = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor],
  )

  // Fetch pieces untuk window ±1 month dari grid (covers prev/next month leak).
  useEffect(() => {
    let cancelled = false
    const from = grid[0]!.iso
    const to = grid[grid.length - 1]!.iso
    setLoading(true)
    fetch(`/api/content/calendar?from=${from}&to=${to}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.success) setPieces(j.data.pieces)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [grid])

  // Group pieces by YYYY-MM-DD untuk fast lookup.
  const piecesByDate = useMemo(() => {
    const map = new Map<string, Piece[]>()
    for (const p of pieces) {
      const iso = new Date(p.scheduledFor).toISOString().slice(0, 10)
      const arr = map.get(iso) ?? []
      arr.push(p)
      map.set(iso, arr)
    }
    return map
  }, [pieces])

  const selectedPieces = selectedDate
    ? (piecesByDate.get(selectedDate) ?? [])
    : []

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const m = c.month + delta
      const year = c.year + Math.floor(m / 12)
      const month = ((m % 12) + 12) % 12
      return { year, month }
    })
    setSelectedDate(null)
  }

  function goToToday() {
    const now = new Date()
    setCursor({ year: now.getFullYear(), month: now.getMonth() })
    setSelectedDate(now.toISOString().slice(0, 10))
  }

  async function unschedule(pieceId: string) {
    const res = await fetch(`/api/content/pieces/${pieceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledFor: null }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal unschedule')
      return
    }
    setPieces((arr) => arr.filter((p) => p.id !== pieceId))
    toast.success('Schedule dihapus')
  }

  return (
    <div className="space-y-4">
      {/* Header: month nav */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <h2 className="font-display text-warm-900 text-xl font-semibold">
            {MONTH_LABELS[cursor.month]} {cursor.year}
          </h2>
          <Button size="sm" variant="outline" onClick={() => shiftMonth(1)}>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Button size="sm" variant="outline" onClick={goToToday}>
            Hari ini
          </Button>
          {loading && (
            <span className="text-warm-500 flex items-center gap-1">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </span>
          )}
        </div>
      </div>

      {/* Grid */}
      <Card>
        <CardContent className="p-3">
          <div className="bg-warm-200 grid grid-cols-7 gap-px overflow-hidden rounded text-xs">
            {DAY_LABELS.map((d) => (
              <div
                key={d}
                className="bg-warm-50 text-warm-500 py-2 text-center font-semibold uppercase"
              >
                {d}
              </div>
            ))}
            {grid.map((cell) => {
              const dayPieces = piecesByDate.get(cell.iso) ?? []
              const inMonth = cell.month === cursor.month
              const isToday = cell.iso === new Date().toISOString().slice(0, 10)
              const isSelected = cell.iso === selectedDate
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => setSelectedDate(cell.iso)}
                  className={`flex min-h-[72px] flex-col gap-1 bg-white p-1.5 text-left transition-colors ${
                    !inMonth ? 'text-warm-300' : 'text-warm-800'
                  } ${isSelected ? 'ring-primary-500 ring-2' : ''} ${
                    isToday ? 'bg-primary-50' : ''
                  } hover:bg-warm-50`}
                >
                  <span
                    className={`text-xs font-semibold ${
                      isToday ? 'text-primary-700' : ''
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="flex flex-wrap gap-0.5">
                    {dayPieces.slice(0, 6).map((p) => (
                      <span
                        key={p.id}
                        className={`size-1.5 rounded-full ${CHANNEL_DOT[p.channel] ?? 'bg-warm-400'}`}
                        title={`${p.title} — ${CHANNEL_LABEL[p.channel] ?? p.channel}`}
                      />
                    ))}
                    {dayPieces.length > 6 && (
                      <span className="text-warm-500 text-xs">
                        +{dayPieces.length - 6}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="text-warm-600 flex flex-wrap gap-3 text-xs">
        {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${CHANNEL_DOT[k]}`} />
            {v}
          </span>
        ))}
      </div>

      {/* Selected day list */}
      {selectedDate && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-warm-900 text-sm font-semibold">
              {new Date(selectedDate).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                weekday: 'long',
              })}
              {selectedPieces.length > 0 && (
                <span className="text-warm-500 ml-2">
                  ({selectedPieces.length} konten)
                </span>
              )}
            </h3>
            {selectedPieces.length === 0 ? (
              <p className="text-warm-500 text-xs">
                Belum ada konten dijadwalkan hari ini. Schedule dari Library.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedPieces.map((p) => {
                  const status = contentPieceStatusMeta[p.status]
                  return (
                    <div
                      key={p.id}
                      className="border-warm-200 bg-warm-50 flex items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap gap-1">
                          <Badge className="bg-warm-100 text-warm-700 text-xs">
                            {CHANNEL_LABEL[p.channel] ?? p.channel}
                          </Badge>
                          {status && (
                            <StatusBadge
                              tone={status.tone}
                              label={status.label}
                            />
                          )}
                          <span className="text-warm-500 text-xs">
                            {new Date(p.scheduledFor).toLocaleTimeString(
                              'id-ID',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </span>
                        </div>
                        <p className="text-warm-900 truncate text-sm font-medium">
                          {p.title}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/content/pieces/${p.id}`}>
                            <ExternalLink className="size-3.5" />
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => unschedule(p.id)}
                          title="Hapus schedule"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface MonthCell {
  iso: string // YYYY-MM-DD
  day: number
  month: number // 0-indexed
}

function buildMonthGrid(year: number, month: number): MonthCell[] {
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay() // 0=Sun..6=Sat
  // Mulai dari Sunday yg paling dekat sebelum/sama firstOfMonth.
  const start = new Date(firstOfMonth)
  start.setDate(start.getDate() - startWeekday)
  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    cells.push({ iso, day: d.getDate(), month: d.getMonth() })
  }
  return cells
}
