'use client'

import { ArrowLeft, BarChart3, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Category =
  | 'HARGA_MAHAL'
  | 'RAGU_KUALITAS'
  | 'TAKUT_PENIPUAN'
  | 'BUTUH_IZIN'
  | 'NANTI_DULU'
  | 'KURANG_PAHAM'
  | 'BANDING_KOMPETITOR'
  | 'TIDAK_BUTUH'
  | 'MASALAH_TEKNIS'
  | 'TIDAK_COCOK'
  | 'LAINNYA'

const CATEGORY_LABEL: Record<Category, string> = {
  HARGA_MAHAL: 'Harga mahal',
  RAGU_KUALITAS: 'Ragu kualitas',
  TAKUT_PENIPUAN: 'Takut penipuan',
  BUTUH_IZIN: 'Butuh izin',
  NANTI_DULU: 'Nanti dulu',
  KURANG_PAHAM: 'Kurang paham',
  BANDING_KOMPETITOR: 'Banding kompetitor',
  TIDAK_BUTUH: 'Tidak butuh',
  MASALAH_TEKNIS: 'Masalah teknis',
  TIDAK_COCOK: 'Tidak cocok',
  LAINNYA: 'Lainnya',
}

const CATEGORY_COLOR: Record<Category, string> = {
  HARGA_MAHAL: 'bg-red-500',
  RAGU_KUALITAS: 'bg-orange-500',
  TAKUT_PENIPUAN: 'bg-rose-600',
  BUTUH_IZIN: 'bg-amber-500',
  NANTI_DULU: 'bg-yellow-500',
  KURANG_PAHAM: 'bg-blue-500',
  BANDING_KOMPETITOR: 'bg-violet-500',
  TIDAK_BUTUH: 'bg-zinc-500',
  MASALAH_TEKNIS: 'bg-pink-500',
  TIDAK_COCOK: 'bg-teal-500',
  LAINNYA: 'bg-slate-400',
}

interface Example {
  id: string
  category: Category
  confidence: number
  evidence: string
  aiNotes: string | null
  createdAt: string
  liveSession: {
    id: string
    customerName: string | null
    outcome: string
  }
}

interface Response {
  room: { id: string; name: string; slug: string }
  categories: Array<{ category: Category; count: number; avgConfidence: number }>
  examples: Example[]
  unanalyzedSessions: number
}

export function ObjectionMap({ roomId }: { roomId: string }) {
  const [data, setData] = useState<Response | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/live-rooms/${roomId}/objections`)
      const json = (await res.json()) as { success: boolean; data?: Response }
      if (json.success && json.data) setData(json.data)
    } finally {
      setRefreshing(false)
    }
  }, [roomId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  async function triggerAnalyze() {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/live-rooms/${roomId}/objections`, {
        method: 'POST',
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { checked: number; analyzed: number; failed: number }
        error?: string
      }
      if (json.success && json.data) {
        toast.success(
          `Analyzed ${json.data.analyzed} session${json.data.failed > 0 ? `, ${json.data.failed} gagal` : ''}.`,
        )
        await fetchData()
      } else {
        toast.error(json.error ?? 'Gagal analyze')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  const totalTags = data.categories.reduce((acc, c) => acc + c.count, 0)
  const maxCount = Math.max(1, ...data.categories.map((c) => c.count))

  const filteredExamples = selectedCategory
    ? data.examples.filter((e) => e.category === selectedCategory)
    : data.examples

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/live-rooms/${roomId}/leads`}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Kembali ke Leads
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" /> Peta Objection — {data.room.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Apa alasan customer ragu / tidak jadi. AI baca transkrip → tag otomatis.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {data.unanalyzedSessions > 0 ? (
            <Button size="sm" onClick={triggerAnalyze} disabled={analyzing}>
              {analyzing ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-3.5 w-3.5" />
              )}
              Analisa {data.unanalyzedSessions} session
            </Button>
          ) : null}
        </div>
      </div>

      {totalTags === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada objection tagged.{' '}
            {data.unanalyzedSessions > 0
              ? `Ada ${data.unanalyzedSessions} session yang belum dianalisa — klik "Analisa" di atas.`
              : 'Belum ada session yang punya cukup konversasi (≥2 pesan customer).'}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Bar chart */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {totalTags} tag total dari {data.examples.length} session
              </div>
              <div className="space-y-1.5">
                {data.categories
                  .sort((a, b) => b.count - a.count)
                  .map((c) => {
                    const width = (c.count / maxCount) * 100
                    const isSelected = selectedCategory === c.category
                    return (
                      <button
                        key={c.category}
                        type="button"
                        onClick={() =>
                          setSelectedCategory(isSelected ? null : c.category)
                        }
                        className={`w-full text-left ${isSelected ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-44 truncate text-xs">
                            {CATEGORY_LABEL[c.category]}
                          </div>
                          <div className="flex-1 h-6 rounded-md bg-warm-100 overflow-hidden">
                            <div
                              className={`h-full ${CATEGORY_COLOR[c.category]} transition-all`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <div className="w-16 text-right text-xs font-mono tabular-nums">
                            {c.count}× <span className="text-muted-foreground">({c.avgConfidence})</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
              </div>
              {selectedCategory ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                  className="mt-2"
                >
                  Reset filter
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {/* Examples */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Contoh terbaru {selectedCategory ? `— ${CATEGORY_LABEL[selectedCategory]}` : ''}
            </h2>
            {filteredExamples.slice(0, 20).map((ex) => (
              <Card key={ex.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`${CATEGORY_COLOR[ex.category]} text-white hover:${CATEGORY_COLOR[ex.category]}`}>
                      {CATEGORY_LABEL[ex.category]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      conf {ex.confidence.toFixed(2)} ·{' '}
                      {ex.liveSession.customerName ?? 'anonymous'} ·{' '}
                      {new Date(ex.createdAt).toLocaleString('id-ID', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <div className="rounded-md bg-warm-50 p-2 text-sm italic">
                    "{ex.evidence}"
                  </div>
                  {ex.aiNotes ? (
                    <div className="text-xs text-muted-foreground">
                      💡 <strong>Saran AI:</strong> {ex.aiNotes}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
