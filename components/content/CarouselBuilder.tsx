'use client'

// CarouselBuilder — multi-slide visual generator untuk IG Carousel.
// Tiap slide pilih template + edit text. Download per-slide PNG atau ZIP.
//
// Slide schema dari ContentSlide DB row OR dari bodyJson.slides array.
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  TEMPLATES,
  getTemplateComponent,
} from './visual-templates/templates'
import type { TemplateProps } from './visual-templates/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SlideInput {
  headline: string
  body: string
}

interface SlideState extends TemplateProps {
  templateId: string
}

interface Props {
  slides: SlideInput[]
  pieceTitle: string
}

const ACCENT_PRESETS = ['#ea580c', '#16a34a', '#2563eb', '#9333ea', '#db2777', '#1a1a1a']

const REAL_W = 1080
const REAL_H = 1080
const PREVIEW_W = 360

export function CarouselBuilder({ slides, pieceTitle }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadingOne, setDownloadingOne] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  // Default template per index — cover quote, body alt tip/numbered, last story w/ CTA.
  function defaultTemplate(idx: number, total: number): string {
    if (idx === 0) return 'quote'
    if (idx === total - 1) return 'story'
    return idx % 2 === 0 ? 'tip' : 'numbered'
  }

  const [slideStates, setSlideStates] = useState<SlideState[]>(() =>
    slides.map((s, i) => ({
      headline: s.headline,
      body: s.body,
      badge: `${i + 1}/${slides.length}`,
      brandLabel: 'Hulao',
      accent: '#ea580c',
      background: '#ea580c',
      templateId: defaultTemplate(i, slides.length),
    })),
  )

  // Keyboard arrow navigation — left/right untuk switch slide.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip kalau user lagi typing di input/textarea.
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') {
        setActiveIdx((i) => Math.max(0, i - 1))
      } else if (e.key === 'ArrowRight') {
        setActiveIdx((i) => Math.min(slideStates.length - 1, i + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slideStates.length])

  const active = slideStates[activeIdx]
  if (!active) return <div className="text-sm text-warm-500">Tidak ada slide</div>

  const TemplateComp = getTemplateComponent(active.templateId)

  function patch(key: keyof SlideState, value: string) {
    setSlideStates((arr) => {
      const next = [...arr]
      next[activeIdx] = { ...next[activeIdx]!, [key]: value }
      return next
    })
  }

  function goPrev() {
    setActiveIdx((i) => Math.max(0, i - 1))
  }
  function goNext() {
    setActiveIdx((i) => Math.min(slideStates.length - 1, i + 1))
  }

  async function downloadCurrent() {
    if (!captureRef.current) return
    setDownloadingOne(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(captureRef.current, {
        width: REAL_W,
        height: REAL_H,
        pixelRatio: 1,
        cacheBust: true,
      })
      const link = document.createElement('a')
      link.download = `${slug(pieceTitle)}-slide-${activeIdx + 1}.png`
      link.href = dataUrl
      link.click()
      toast.success(`Slide ${activeIdx + 1} ter-download`)
    } catch (err) {
      console.error(err)
      toast.error('Gagal download. Coba lagi.')
    } finally {
      setDownloadingOne(false)
    }
  }

  async function downloadAll() {
    if (!captureRef.current) return
    setDownloadingAll(true)
    const originalIdx = activeIdx
    try {
      const { toPng } = await import('html-to-image')
      // Loop tiap slide, switch state, capture, download. Sequential supaya
      // capture node sempat re-render.
      for (let i = 0; i < slideStates.length; i++) {
        setActiveIdx(i)
        // Beri waktu render: 1 frame next.
        await new Promise((r) => setTimeout(r, 80))
        if (!captureRef.current) continue
        const dataUrl = await toPng(captureRef.current, {
          width: REAL_W,
          height: REAL_H,
          pixelRatio: 1,
          cacheBust: true,
        })
        const link = document.createElement('a')
        link.download = `${slug(pieceTitle)}-slide-${i + 1}.png`
        link.href = dataUrl
        link.click()
        // Delay kecil supaya browser tidak block multi-download.
        await new Promise((r) => setTimeout(r, 200))
      }
      toast.success(`${slideStates.length} slide ter-download`)
    } catch (err) {
      console.error(err)
      toast.error('Gagal download semua. Coba per slide.')
    } finally {
      setActiveIdx(originalIdx)
      setDownloadingAll(false)
    }
  }

  const fitTemplates = TEMPLATES.filter((t) =>
    t.fitChannels.some((c) =>
      activeIdx === 0
        ? c === 'IG_CAROUSEL_COVER'
        : activeIdx === slideStates.length - 1
          ? c === 'IG_CAROUSEL_CTA'
          : c === 'IG_CAROUSEL_BODY' || c === 'IG_POST',
    ),
  )

  return (
    <div className="space-y-4">
      {/* Header: slide count + thumb strip */}
      <div className="flex flex-col gap-2 rounded-md border border-warm-200 bg-warm-50 p-3">
        <div className="flex items-center justify-between text-xs">
          <strong className="text-warm-900">
            Slide {activeIdx + 1} dari {slideStates.length}
          </strong>
          <span className="text-warm-500">
            Tip: pakai panah ◀▶ keyboard untuk navigasi cepat
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {slideStates.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`shrink-0 rounded px-3 py-1 text-xs font-medium transition-all ${
                i === activeIdx
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'bg-white text-warm-600 hover:bg-warm-100'
              }`}
            >
              Slide {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Preview dengan big nav arrows */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div
              className="relative overflow-hidden rounded-xl shadow-xl"
              style={{ width: PREVIEW_W, height: PREVIEW_W }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: REAL_W,
                  height: REAL_H,
                  transformOrigin: 'top left',
                  transform: `scale(${PREVIEW_W / REAL_W})`,
                }}
              >
                <div
                  ref={captureRef}
                  style={{ width: REAL_W, height: REAL_H }}
                >
                  {/* key=activeIdx supaya React unmount template lama saat
                      switch slide — preview update cleanly */}
                  <TemplateComp
                    key={`tpl-${activeIdx}-${active.templateId}`}
                    headline={active.headline}
                    body={active.body}
                    badge={active.badge}
                    brandLabel={active.brandLabel}
                    cta={active.cta}
                    accent={active.accent}
                    background={active.background}
                    aspect="square"
                  />
                </div>
              </div>
            </div>
            {/* Big arrow nav overlay — kanan & kiri */}
            <button
              type="button"
              onClick={goPrev}
              disabled={activeIdx === 0}
              className="absolute left-1 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg ring-1 ring-warm-200 backdrop-blur transition-opacity hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Slide sebelumnya"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={activeIdx === slideStates.length - 1}
              className="absolute right-1 top-1/2 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg ring-1 ring-warm-200 backdrop-blur transition-opacity hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Slide berikutnya"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          {/* Page indicator dots */}
          <div className="flex gap-1.5">
            {slideStates.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={`size-2 rounded-full transition-all ${
                  i === activeIdx
                    ? 'w-6 bg-primary-500'
                    : 'bg-warm-300 hover:bg-warm-400'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
          <div className="text-[11px] text-warm-500">
            Resolusi export: {REAL_W}×{REAL_H}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={downloadCurrent}
              disabled={downloadingOne || downloadingAll}
              variant="outline"
            >
              {downloadingOne ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              Download slide ini
            </Button>
            <Button
              onClick={downloadAll}
              disabled={downloadingOne || downloadingAll}
              className="bg-primary-500 text-white hover:bg-primary-600"
            >
              {downloadingAll ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              Download {slideStates.length} slide
            </Button>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <section className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-warm-500">
              Template slide ke-{activeIdx + 1}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(fitTemplates.length > 0 ? fitTemplates : TEMPLATES).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => patch('templateId' as keyof SlideState, t.id)}
                  className={`rounded-md border p-2 text-left text-xs transition-all ${
                    active.templateId === t.id
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                      : 'border-warm-200 hover:bg-warm-50'
                  }`}
                >
                  <div className="font-semibold text-warm-900">{t.name}</div>
                  <div className="text-[10px] text-warm-500">
                    {t.description}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-warm-500">
              Warna utama
            </Label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    patch('accent', color)
                    patch('background', color)
                  }}
                  className={`size-8 rounded-full border-2 transition-all ${
                    active.accent === color
                      ? 'border-warm-900 ring-2 ring-primary-200'
                      : 'border-warm-200'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                value={active.accent ?? '#ea580c'}
                onChange={(e) => {
                  patch('accent', e.target.value)
                  patch('background', e.target.value)
                }}
                className="size-8 cursor-pointer rounded-full border-2 border-warm-200"
              />
            </div>
          </section>

          {/* Force remount semua field saat slide switch — supaya value
              terbaru selalu reflect state slide aktif (defensif terhadap
              edge-case React reconciliation pada controlled input). */}
          <section key={`fields-${activeIdx}`} className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              ✏️ Edit slide {activeIdx + 1}
            </Label>
            <div className="space-y-1">
              <Label className="text-[11px] text-warm-600">Headline</Label>
              <Input
                value={active.headline ?? ''}
                onChange={(e) => patch('headline', e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-warm-600">Badge</Label>
              <Input
                value={active.badge ?? ''}
                onChange={(e) => patch('badge', e.target.value)}
                placeholder={`mis. '${activeIdx + 1}/${slideStates.length}'`}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-warm-600">Body</Label>
              <textarea
                value={active.body ?? ''}
                onChange={(e) => patch('body', e.target.value)}
                rows={3}
                className="w-full rounded-md border border-warm-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            {activeIdx === slideStates.length - 1 && (
              <div className="space-y-1">
                <Label className="text-[11px] text-warm-600">CTA</Label>
                <Input
                  value={active.cta ?? ''}
                  onChange={(e) => patch('cta', e.target.value)}
                  className="text-sm"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-[11px] text-warm-600">Brand label</Label>
              <Input
                value={active.brandLabel ?? ''}
                onChange={(e) => patch('brandLabel', e.target.value)}
                className="text-sm"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}
