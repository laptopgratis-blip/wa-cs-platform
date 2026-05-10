'use client'

// VisualBuilder — single-frame visual generator untuk WA Status / IG Story /
// IG Post. Render template di-pilih + editable text overlay + download PNG.
//
// Dimensi real export: 1080x1080 (post) atau 1080x1920 (story/status).
// Container DIV di-hide-render dengan size real, lalu di-snapshot via
// html-to-image. Preview UI di-scale ke ukuran cocok layar.
import { Download, Loader2, Palette } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  TEMPLATES,
  getTemplateComponent,
} from './visual-templates/templates'
import type { TemplateProps } from './visual-templates/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  channel: 'WA_STATUS' | 'IG_STORY' | 'IG_POST'
  initialHeadline?: string
  initialBody?: string
  initialCta?: string
  initialBrand?: string
  pieceTitle: string
}

const ACCENT_PRESETS = [
  '#ea580c', // primary orange
  '#16a34a', // emerald
  '#2563eb', // blue
  '#9333ea', // purple
  '#db2777', // pink
  '#1a1a1a', // black
]

export function VisualBuilder({
  channel,
  initialHeadline,
  initialBody,
  initialCta,
  initialBrand,
  pieceTitle,
}: Props) {
  const isStory = channel === 'WA_STATUS' || channel === 'IG_STORY'
  const realDim = isStory
    ? { width: 1080, height: 1920 }
    : { width: 1080, height: 1080 }

  const [templateId, setTemplateId] = useState('quote')
  const [props, setProps] = useState<TemplateProps>({
    headline: initialHeadline ?? '',
    body: initialBody ?? '',
    cta: initialCta ?? '',
    badge: '',
    brandLabel: initialBrand ?? 'Hulao',
    accent: '#ea580c',
    background: undefined,
  })
  const [downloading, setDownloading] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  const TemplateComp = getTemplateComponent(templateId)

  // Filter template fit untuk channel — preset awal.
  const fitTemplates = TEMPLATES.filter((t) =>
    t.fitChannels.some((c) => c === channel),
  )
  const allTemplates = TEMPLATES

  async function handleDownload() {
    if (!captureRef.current) return
    setDownloading(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(captureRef.current, {
        width: realDim.width,
        height: realDim.height,
        pixelRatio: 1,
        cacheBust: true,
      })
      const link = document.createElement('a')
      link.download = `${slug(pieceTitle)}-${channel.toLowerCase()}.png`
      link.href = dataUrl
      link.click()
      toast.success('Visual ter-download')
    } catch (err) {
      console.error(err)
      toast.error('Gagal generate PNG. Coba refresh halaman.')
    } finally {
      setDownloading(false)
    }
  }

  function patch(key: keyof TemplateProps, value: string) {
    setProps((p) => ({ ...p, [key]: value }))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="text-xs text-warm-500">
          Preview {channel.replace('_', ' ').toLowerCase()} ({realDim.width}×
          {realDim.height})
        </div>
        <div
          className="relative overflow-hidden rounded-xl shadow-xl"
          style={{
            width: isStory ? 270 : 360,
            height: isStory ? 480 : 360,
          }}
        >
          {/* Hidden full-resolution capture container */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: realDim.width,
              height: realDim.height,
              transformOrigin: 'top left',
              transform: `scale(${(isStory ? 270 : 360) / realDim.width})`,
            }}
          >
            <div
              ref={captureRef}
              style={{ width: realDim.width, height: realDim.height }}
            >
              <TemplateComp {...props} aspect={isStory ? 'story' : 'square'} />
            </div>
          </div>
        </div>
        <Button
          onClick={handleDownload}
          disabled={downloading}
          size="lg"
          className="bg-primary-500 text-white hover:bg-primary-600"
        >
          {downloading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Download className="mr-2 size-4" /> Download PNG
            </>
          )}
        </Button>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <section className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-warm-500">
            Template
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {(fitTemplates.length > 0 ? fitTemplates : allTemplates).map(
              (t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-md border p-2 text-left text-xs transition-all ${
                    templateId === t.id
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                      : 'border-warm-200 hover:bg-warm-50'
                  }`}
                >
                  <div className="font-semibold text-warm-900">{t.name}</div>
                  <div className="text-[10px] text-warm-500">
                    {t.description}
                  </div>
                </button>
              ),
            )}
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
                  props.accent === color
                    ? 'border-warm-900 ring-2 ring-primary-200'
                    : 'border-warm-200'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
            <input
              type="color"
              value={props.accent ?? '#ea580c'}
              onChange={(e) => {
                patch('accent', e.target.value)
                patch('background', e.target.value)
              }}
              className="size-8 cursor-pointer rounded-full border-2 border-warm-200"
              title="Custom"
            />
          </div>
        </section>

        <section className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-warm-500">
            Konten
          </Label>
          <FieldText
            label="Headline"
            value={props.headline ?? ''}
            onChange={(v) => patch('headline', v)}
          />
          <FieldText
            label="Badge / Eyebrow"
            value={props.badge ?? ''}
            onChange={(v) => patch('badge', v)}
            placeholder="opsional, mis. 'TIP #1'"
          />
          <FieldTextarea
            label="Body / penjelasan"
            value={props.body ?? ''}
            onChange={(v) => patch('body', v)}
          />
          <FieldText
            label="CTA (opsional)"
            value={props.cta ?? ''}
            onChange={(v) => patch('cta', v)}
            placeholder="opsional"
          />
          <FieldText
            label="Brand label"
            value={props.brandLabel ?? ''}
            onChange={(v) => patch('brandLabel', v)}
            placeholder="opsional, mis. 'Hulao'"
          />
        </section>

        <div className="rounded-md border border-warm-200 bg-warm-50 p-3 text-[11px] text-warm-600">
          <Palette className="mr-1 inline size-3 text-primary-500" />
          Edit text & warna di sini, preview real-time. Klik download untuk
          export PNG resolusi {realDim.width}×{realDim.height}.
        </div>
      </div>
    </div>
  )
}

function FieldText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-warm-600">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  )
}

function FieldTextarea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-warm-600">{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-warm-300 bg-white px-3 py-2 text-sm"
      />
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
