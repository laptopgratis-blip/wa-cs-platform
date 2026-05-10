'use client'

// Calendar view — month grid 7×6 dengan piece distribution per tanggal.
// Click tanggal → list piece di hari itu, dengan opsi unschedule.
//
// Bukan auto-publish — purely planning view.
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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

const CHANNEL_DOT: Record<string, string> = {
  WA_STATUS: 'bg-emerald-500',
  IG_STORY: 'bg-purple-500',
  IG_POST: 'bg-pink-500',
  IG_CAROUSEL: 'bg-blue-500',
  IG_REELS: 'bg-rose-500',
  TIKTOK: 'bg-warm-700',
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-warm-100 text-warm-700' },
  READY: { label: 'Siap post', cls: 'bg-blue-100 text-blue-700' },
  POSTED: { label: 'Sudah post', cls: 'bg-emerald-100 text-emerald-700' },
  ARCHIVED: { label: 'Arsip', cls: 'bg-rose-100 text-rose-700' },
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
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])

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

  const selectedPieces = selectedDate ? (piecesByDate.get(selectedDate) ?? []) : []

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
          <h2 className="font-display text-lg font-bold text-warm-900">
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
            <span className="flex items-center gap-1 text-warm-500">
              <Loader2 className="size-3 animate-spin" />
              Loading
            </span>
          )}
        </div>
      </div>

      {/* Grid */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded bg-warm-200 text-xs">
            {DAY_LABELS.map((d) => (
              <div
                key={d}
                className="bg-warm-50 py-2 text-center font-semibold uppercase text-warm-500"
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
                  } ${isSelected ? 'ring-2 ring-primary-500' : ''} ${
                    isToday ? 'bg-primary-50' : ''
                  } hover:bg-warm-50`}
                >
                  <span
                    className={`text-[11px] font-semibold ${
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
                      <span className="text-[9px] text-warm-500">
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
      <div className="flex flex-wrap gap-3 text-[11px] text-warm-600">
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
            <h3 className="text-sm font-semibold text-warm-900">
              {new Date(selectedDate).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                weekday: 'long',
              })}
              {selectedPieces.length > 0 && (
                <span className="ml-2 text-warm-500">
                  ({selectedPieces.length} konten)
                </span>
              )}
            </h3>
            {selectedPieces.length === 0 ? (
              <p className="text-xs text-warm-500">
                Belum ada konten dijadwalkan hari ini. Schedule dari Library.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedPieces.map((p) => {
                  const status = STATUS_LABEL[p.status]
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-warm-200 bg-warm-50 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap gap-1">
                          <Badge className="bg-warm-100 text-[10px] text-warm-700">
                            {CHANNEL_LABEL[p.channel] ?? p.channel}
                          </Badge>
                          {status && (
                            <Badge className={`text-[10px] ${status.cls}`}>
                              {status.label}
                            </Badge>
                          )}
                          <span className="text-[10px] text-warm-500">
                            {new Date(p.scheduledFor).toLocaleTimeString(
                              'id-ID',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </span>
                        </div>
                        <p className="truncate text-sm font-medium text-warm-900">
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
                          ✕
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
