'use client'

// Heatmap visualizer — iframe LP public preview + canvas overlay.
// Render dot per bin di koordinat % page, intensity by count/max.
//
// Approach: overlay canvas yang sama ukuran dengan iframe content. Karena
// iframe cross-iframe access ke contentDocument bisa di-block (same-origin
// OK karena kita serve dari /p/<slug> di same domain), kita ukur via
// iframe.contentDocument.documentElement.scrollHeight saat load.
//
// Heatmap rendering: native canvas radial gradient — no library dep.
// Setiap point gambar circle dengan radius+alpha proportional ke count.
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Bin {
  x: number // 0-99
  y: number // 0-99
  count: number
}

type Device = 'DESKTOP' | 'MOBILE' | 'TABLET'

interface Props {
  lpId: string
  slug: string
}

const DEVICE_WIDTHS: Record<Device, number> = {
  DESKTOP: 1280,
  TABLET: 820,
  MOBILE: 390,
}

export function HeatmapView({ lpId, slug }: Props) {
  const [device, setDevice] = useState<Device>('DESKTOP')
  const [bins, setBins] = useState<Bin[]>([])
  const [maxCount, setMaxCount] = useState(0)
  const [totalClicks, setTotalClicks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [iframeReady, setIframeReady] = useState(false)
  const [pageHeight, setPageHeight] = useState<number | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewWidth = DEVICE_WIDTHS[device]

  // Fetch heatmap data per device.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/lp/${encodeURIComponent(lpId)}/heatmap?device=${device}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.success) {
          setBins(j.data.bins)
          setMaxCount(j.data.maxCount)
          setTotalClicks(j.data.totalClicks)
        }
      })
      .catch(() => {
        /* swallow */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lpId, device])

  // Reset iframe state saat device berubah (force re-load).
  useEffect(() => {
    setIframeReady(false)
    setPageHeight(null)
  }, [device])

  // Iframe onLoad — ukur tinggi page LP.
  const onIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      if (!doc) {
        // Cross-origin atau LP belum publish — fallback fixed height.
        setPageHeight(2000)
        setIframeReady(true)
        return
      }
      // Tunggu sebentar supaya CSS settle.
      setTimeout(() => {
        if (!iframeRef.current) return
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0,
        )
        setPageHeight(h)
        setIframeReady(true)
      }, 300)
    } catch {
      setPageHeight(2000)
      setIframeReady(true)
    }
  }, [])

  // Render heatmap ke canvas saat data + dimensi siap.
  useEffect(() => {
    if (!iframeReady || !pageHeight) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = previewWidth
    canvas.height = pageHeight
    ctx.clearRect(0, 0, previewWidth, pageHeight)
    if (bins.length === 0 || maxCount === 0) return
    // Per bin: gambar radial gradient, additive blend supaya overlap → hot.
    ctx.globalCompositeOperation = 'lighter'
    const cellW = previewWidth / 100
    const cellH = pageHeight / 100
    // Radius proportional ke ukuran cell, dengan minimum 30px untuk visibility.
    const radius = Math.max(30, Math.min(cellW, cellH) * 4)
    for (const b of bins) {
      const cx = (b.x + 0.5) * cellW
      const cy = (b.y + 0.5) * cellH
      const intensity = Math.min(1, b.count / maxCount)
      const alpha = 0.15 + intensity * 0.55
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      // Hot palette: red → orange → yellow → transparent.
      grad.addColorStop(0, `rgba(220, 38, 38, ${alpha})`)
      grad.addColorStop(0.4, `rgba(234, 88, 12, ${alpha * 0.6})`)
      grad.addColorStop(0.7, `rgba(245, 158, 11, ${alpha * 0.3})`)
      grad.addColorStop(1, 'rgba(255, 255, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }, [bins, maxCount, iframeReady, pageHeight, previewWidth])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-warm-600">Device:</span>
          {(['DESKTOP', 'TABLET', 'MOBILE'] as Device[]).map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={device === d ? 'default' : 'outline'}
              onClick={() => setDevice(d)}
              className="h-7 px-2.5 text-xs"
            >
              {d}
            </Button>
          ))}
        </div>
        <div className="text-xs text-warm-600">
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <>
              <span className="font-semibold text-warm-900">{totalClicks}</span>{' '}
              klik total{' '}
              {bins.length > 0 && (
                <span className="text-warm-500">
                  · max {maxCount} klik di hot-spot
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {bins.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-warm-500">
            Belum ada data heatmap untuk device <strong>{device}</strong>.
            Tracker akan capture coordinate setiap klik visitor — butuh min
            ~50-100 klik supaya pattern terlihat jelas.
          </CardContent>
        </Card>
      )}

      {bins.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-warm-200 bg-warm-100 p-3">
          <div
            className="relative mx-auto bg-white shadow-md"
            style={{ width: previewWidth }}
          >
            <iframe
              ref={iframeRef}
              src={`/p/${encodeURIComponent(slug)}`}
              onLoad={onIframeLoad}
              className="block w-full border-0"
              style={{
                width: previewWidth,
                height: pageHeight ?? 2000,
                pointerEvents: 'none', // visitor tidak interact, ini cuma preview
              }}
              sandbox="allow-same-origin allow-scripts"
              title="LP preview"
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0"
              style={{
                width: previewWidth,
                height: pageHeight ?? 2000,
                mixBlendMode: 'multiply',
              }}
            />
            {!iframeReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <Loader2 className="size-6 animate-spin text-warm-400" />
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-warm-500">
            Hot spot (merah) = banyak klik di area itu. Cool spot (kosong) =
            sedikit/tidak ada klik. Pakai untuk identify CTA yang terlewat,
            atau elemen yang dikira clickable padahal tidak.
          </p>
        </div>
      )}
    </div>
  )
}
