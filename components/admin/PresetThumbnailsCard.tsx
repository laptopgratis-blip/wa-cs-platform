'use client'

// Kartu admin: backfill thumbnail preset Klip Live (visual hook + background).
// Dipasang di /admin/host-templates. Loop POST batch kecil sampai semua preset
// punya thumbnail (75 gambar → ±15-25 menit; bisa dihentikan & dilanjut kapan
// saja karena idempotent per-file).
import { ImageIcon, Loader2, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Status {
  total: number
  done: number
  missing: Array<{ kind: string; slug: string; nameId: string }>
}

export function PresetThumbnailsCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [running, setRunning] = useState(false)
  const [lastSlug, setLastSlug] = useState<string | null>(null)
  const stopRef = useRef(false)

  async function loadStatus() {
    try {
      const res = await fetch('/api/admin/host-presets/generate-thumbnails')
      const json = (await res.json()) as { success: boolean; data?: Status }
      if (json.success && json.data) setStatus(json.data)
    } catch {
      /* biarkan null — kartu tampil tanpa angka */
    }
  }

  useEffect(() => {
    // Microtask supaya setState pertama tidak sync di body effect
    // (react-hooks/set-state-in-effect) — pola sama dgn SoulLabManager.
    void Promise.resolve().then(() => loadStatus())
  }, [])

  async function runAll() {
    setRunning(true)
    stopRef.current = false
    let consecutiveAllFailed = 0
    try {
      // Loop batch 3 sampai habis / dihentikan / gagal beruntun.
      for (;;) {
        if (stopRef.current) break
        const res = await fetch('/api/admin/host-presets/generate-thumbnails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 3 }),
        })
        const json = (await res.json()) as {
          success: boolean
          error?: string
          data?: {
            generated: Array<{ slug: string }>
            failed: Array<{ slug: string; error: string }>
            remaining: number
          }
        }
        if (!res.ok || !json.success || !json.data) {
          toast.error(json.error || 'Gagal generate thumbnail')
          break
        }
        const d = json.data
        if (d.generated.length > 0) {
          setLastSlug(d.generated[d.generated.length - 1]?.slug ?? null)
          consecutiveAllFailed = 0
        }
        if (d.failed.length > 0 && d.generated.length === 0) {
          // Batch gagal total (mis. API key GOOGLE bermasalah) — stop supaya
          // tidak loop error tanpa henti.
          consecutiveAllFailed += 1
          if (consecutiveAllFailed >= 2) {
            toast.error(
              `Generate berhenti — gagal beruntun: ${d.failed[0]?.error ?? 'unknown'}`,
            )
            break
          }
        }
        await loadStatus()
        if (d.remaining <= 0) {
          toast.success('Semua thumbnail preset sudah ter-generate')
          break
        }
      }
    } finally {
      setRunning(false)
      setLastSlug(null)
      void loadStatus()
    }
  }

  // Semua sudah lengkap → tidak perlu tampil menonjol; render ringkas saja.
  const complete = status !== null && status.missing.length === 0

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="bg-primary-50 flex size-9 shrink-0 items-center justify-center rounded-lg">
            <ImageIcon className="text-primary-600 size-4" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold">
              Thumbnail Preset Klip Live{' '}
              {status ? (
                <span className="text-muted-foreground font-normal">
                  — {status.done}/{status.total} tersedia
                </span>
              ) : null}
            </p>
            <p className="text-muted-foreground text-xs">
              {complete
                ? 'Semua visual hook & background sudah punya thumbnail.'
                : 'Generate gambar thumbnail (Gemini) untuk picker visual hook & background di wizard Klip Live.'}
            </p>
            {running && (
              <p className={cn('mt-1 text-xs', TONES.warning.text)}>
                Sedang generate{lastSlug ? ` — ${lastSlug}` : ''}… biarkan tab
                terbuka. Bisa dihentikan & dilanjut kapan saja.
              </p>
            )}
          </div>
        </div>
        {!complete && (
          <div className="flex items-center gap-2">
            {running ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  stopRef.current = true
                }}
              >
                <Square className="mr-2 size-3.5" />
                Hentikan
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void runAll()}
                disabled={!status}
              >
                {running && <Loader2 className="mr-2 size-4 animate-spin" />}
                Generate{status ? ` ${status.missing.length} thumbnail` : ''}
              </Button>
            )}
            {running && <Loader2 className="size-4 animate-spin" />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
