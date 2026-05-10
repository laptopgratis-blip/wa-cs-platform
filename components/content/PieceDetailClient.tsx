'use client'

// PieceDetailClient — render channel-specific body + actions
// (copy, mark posted/archived, edit body raw via JSON textarea).
import {
  Archive,
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Edit3,
  FileText,
  Image as ImageIcon,
  Save,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { CarouselBuilder } from './CarouselBuilder'
import { VisualBuilder } from './VisualBuilder'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface Slide {
  id: string
  slideIndex: number
  headline: string
  body: string
}

interface PieceMetrics {
  reach: number | null
  impressions: number | null
  saves: number | null
  shares: number | null
  comments: number | null
  dms: number | null
  linkClicks: number | null
  metricUpdatedAt: string | null
}

interface AdVariantUI {
  id: string
  variantType: string
  value: string
  order: number
  impressions: number | null
  clicks: number | null
  ctr: number | null
  conversions: number | null
  spendRp: number | null
}

interface PieceData {
  id: string
  title: string
  channel: string
  funnelStage: string
  format: string
  status: string
  tokensCharged: number
  scheduledFor: string | null
  pieceType?: string
  adsPlatform?: string | null
  adsFormat?: string | null
  metrics: PieceMetrics
  bodyJson: Record<string, unknown>
  slides: Slide[]
  variants?: AdVariantUI[]
  sourceIdea: {
    method: string
    hook: string
    whyItWorks: string
  } | null
  brief: {
    lpTitle: string | null
    lpSlug: string | null
    manualTitle: string | null
  } | null
}

const CHANNEL_LABEL: Record<string, string> = {
  WA_STATUS: 'WA Status',
  IG_STORY: 'IG Story',
  IG_POST: 'IG Post',
  IG_CAROUSEL: 'IG Carousel',
  IG_REELS: 'IG Reels',
  TIKTOK: 'TikTok',
  META_ADS: 'Meta Ads',
  TIKTOK_ADS: 'TikTok Ads',
}

const FUNNEL_LABEL: Record<string, { label: string; cls: string }> = {
  TOFU: { label: 'Awareness', cls: 'bg-blue-100 text-blue-700' },
  MOFU: { label: 'Pertimbangan', cls: 'bg-amber-100 text-amber-700' },
  BOFU: { label: 'Beli', cls: 'bg-emerald-100 text-emerald-700' },
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-warm-100 text-warm-700' },
  READY: { label: 'Siap post', cls: 'bg-blue-100 text-blue-700' },
  POSTED: { label: 'Sudah post', cls: 'bg-emerald-100 text-emerald-700' },
  ARCHIVED: { label: 'Arsip', cls: 'bg-rose-100 text-rose-700' },
}

// Channel yg punya visual builder.
const VISUAL_CHANNELS = new Set([
  'WA_STATUS',
  'IG_STORY',
  'IG_POST',
  'IG_CAROUSEL',
])

export function PieceDetailClient({ piece }: { piece: PieceData }) {
  const [body, setBody] = useState(piece.bodyJson)
  const [status, setStatus] = useState(piece.status)
  const [scheduledFor, setScheduledFor] = useState(piece.scheduledFor)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(JSON.stringify(piece.bodyJson, null, 2))
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const hasVisual = VISUAL_CHANNELS.has(piece.channel)
  const isAds = piece.pieceType === 'ADS'
  const [variants, setVariants] = useState<AdVariantUI[]>(piece.variants ?? [])

  async function copyToClipboard() {
    const text = formatForClipboard(piece.channel, body)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
      toast.success('Copied — paste di app sosmed kamu')
    } catch {
      toast.error('Copy gagal — select manual lalu copy')
    }
  }

  async function updateStatus(newStatus: string) {
    const res = await fetch(`/api/content/pieces/${piece.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal update')
      return
    }
    setStatus(newStatus)
    toast.success(`Status: ${STATUS_LABEL[newStatus]?.label ?? newStatus}`)
  }

  async function schedule() {
    const defaultIso = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ')
    const input = window.prompt(
      'Jadwalkan posting (YYYY-MM-DD HH:MM):',
      scheduledFor
        ? new Date(scheduledFor).toISOString().slice(0, 16).replace('T', ' ')
        : defaultIso,
    )
    if (input === null) return // user cancel
    if (!input.trim()) {
      // Clear schedule.
      const res = await fetch(`/api/content/pieces/${piece.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: null }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal update')
        return
      }
      setScheduledFor(null)
      toast.success('Schedule dihapus')
      return
    }
    const trimmed = input.trim().replace(' ', 'T')
    const withSec = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
      ? `${trimmed}:00`
      : trimmed
    const d = new Date(withSec)
    if (Number.isNaN(d.getTime())) {
      toast.error('Format tidak valid. Pakai YYYY-MM-DD HH:MM')
      return
    }
    const res = await fetch(`/api/content/pieces/${piece.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledFor: d.toISOString() }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal schedule')
      return
    }
    setScheduledFor(d.toISOString())
    toast.success(
      `Dijadwalkan ${d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`,
    )
  }

  async function saveEdit() {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(editValue)
    } catch {
      toast.error('JSON tidak valid')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/content/pieces/${piece.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyJson: parsed }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal save')
        return
      }
      setBody(parsed)
      setEditing(false)
      toast.success('Tersimpan')
    } finally {
      setSaving(false)
    }
  }

  const funnel = FUNNEL_LABEL[piece.funnelStage]
  const statusInfo = STATUS_LABEL[status]

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge className="bg-warm-100 text-xs text-warm-700">
            {CHANNEL_LABEL[piece.channel] ?? piece.channel}
          </Badge>
          {funnel && <Badge className={`text-xs ${funnel.cls}`}>{funnel.label}</Badge>}
          {statusInfo && (
            <Badge className={`text-xs ${statusInfo.cls}`}>{statusInfo.label}</Badge>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold text-warm-900">
          {piece.title}
        </h1>
        {piece.brief && (
          <p className="mt-1 text-xs text-warm-500">
            Sumber: {piece.brief.lpTitle ?? piece.brief.manualTitle ?? '—'}
          </p>
        )}
      </div>

      {/* Source idea */}
      {piece.sourceIdea && (
        <Card>
          <CardContent className="space-y-1 p-4 text-xs">
            <div className="font-semibold text-warm-700">Sumber ide:</div>
            <div className="italic text-warm-800">"{piece.sourceIdea.hook}"</div>
            <div className="text-warm-500">
              <strong>Method:</strong> {piece.sourceIdea.method} ·{' '}
              <strong>Kenapa works:</strong> {piece.sourceIdea.whyItWorks}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedule indicator */}
      {scheduledFor && (
        <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
          <span className="text-blue-900">
            📅 Dijadwalkan{' '}
            <strong>
              {new Date(scheduledFor).toLocaleString('id-ID', {
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            </strong>
          </span>
          <Button size="sm" variant="ghost" onClick={schedule}>
            Ubah
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={copyToClipboard} variant="default">
          {copied ? (
            <>
              <ClipboardCheck className="mr-1.5 size-4" /> Tercopy
            </>
          ) : (
            <>
              <Clipboard className="mr-1.5 size-4" /> Copy konten
            </>
          )}
        </Button>
        {status !== 'POSTED' && status !== 'ARCHIVED' && !scheduledFor && (
          <Button
            variant="outline"
            onClick={schedule}
            className="text-blue-700"
          >
            <CalendarPlus className="mr-1.5 size-4" /> Jadwalkan
          </Button>
        )}
        {status !== 'POSTED' && (
          <Button
            variant="outline"
            onClick={() => updateStatus('POSTED')}
            className="text-emerald-700"
          >
            <CheckCircle2 className="mr-1.5 size-4" /> Tandai sudah post
          </Button>
        )}
        {status !== 'ARCHIVED' && (
          <Button
            variant="outline"
            onClick={() => updateStatus('ARCHIVED')}
            className="text-rose-700"
          >
            <Archive className="mr-1.5 size-4" /> Arsip
          </Button>
        )}
        {!editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Edit3 className="mr-1.5 size-4" /> Edit
          </Button>
        )}
      </div>

      {/* Body render — ads punya layout sendiri (variants + visual brief +
          storyboard). Organic punya tab visual+script kalau channel punya
          visual builder. */}
      {!editing && isAds ? (
        <>
          <AdsBodyRenderer body={body} adsFormat={piece.adsFormat ?? null} />
          <AdVariantsSection
            variants={variants}
            onVariantsChange={setVariants}
          />
        </>
      ) : !editing && hasVisual ? (
        <Tabs defaultValue="script">
          <TabsList>
            <TabsTrigger value="script">
              <FileText className="mr-1.5 size-3.5" /> Script & caption
            </TabsTrigger>
            <TabsTrigger value="visual">
              <ImageIcon className="mr-1.5 size-3.5" /> Buat Visual
            </TabsTrigger>
          </TabsList>
          <TabsContent value="script" className="mt-4">
            <BodyRenderer channel={piece.channel} body={body} slides={piece.slides} />
          </TabsContent>
          <TabsContent value="visual" className="mt-4">
            <VisualSection channel={piece.channel} body={body} slides={piece.slides} pieceTitle={piece.title} />
          </TabsContent>
        </Tabs>
      ) : (
        !editing && <BodyRenderer channel={piece.channel} body={body} slides={piece.slides} />
      )}

      {/* Edit JSON raw */}
      {editing && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Edit body (JSON)</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(false)
                    setEditValue(JSON.stringify(body, null, 2))
                  }}
                >
                  <X className="mr-1 size-3.5" /> Batal
                </Button>
                <Button size="sm" onClick={saveEdit} disabled={saving}>
                  <Save className="mr-1 size-3.5" />
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </div>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="h-96 w-full rounded-md border border-warm-300 bg-warm-50 p-3 font-mono text-xs"
            />
            <p className="text-[11px] text-warm-500">
              Edit fields sesuai schema channel. Pastikan JSON valid sebelum
              simpan.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Phase 5: form metric input */}
      {(status === 'POSTED' || piece.metrics.metricUpdatedAt) && (
        <MetricSection pieceId={piece.id} initial={piece.metrics} />
      )}

      <p className="text-[11px] text-warm-400">
        Token kepake bikin konten ini: {piece.tokensCharged.toLocaleString('id-ID')}
      </p>
    </div>
  )
}

function MetricSection({
  pieceId,
  initial,
}: {
  pieceId: string
  initial: PieceMetrics
}) {
  const [m, setM] = useState({
    reach: initial.reach ?? '',
    saves: initial.saves ?? '',
    shares: initial.shares ?? '',
    comments: initial.comments ?? '',
    dms: initial.dms ?? '',
    linkClicks: initial.linkClicks ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(initial.metricUpdatedAt)

  function patch(key: keyof typeof m, value: string) {
    setM((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, number | null> = {}
      ;(['reach', 'saves', 'shares', 'comments', 'dms', 'linkClicks'] as const).forEach(
        (k) => {
          const raw = m[k]
          if (raw === '' || raw === null) {
            body[k] = null
          } else {
            const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
            body[k] = Number.isFinite(n) ? n : null
          }
        },
      )
      const res = await fetch(`/api/content/pieces/${pieceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal save metric')
        return
      }
      setUpdatedAt(new Date().toISOString())
      toast.success('Metric tersimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-warm-900">
            <BarChart3 className="size-4 text-primary-500" />
            Performa konten
          </h3>
          {updatedAt && (
            <span className="text-[10px] text-warm-500">
              Update: {new Date(updatedAt).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          )}
        </div>
        <p className="text-xs text-warm-500">
          Catat metric setelah konten dipost — Hulao pakai data ini untuk
          rekomendasi konten serupa di masa depan.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricInput label="Reach" value={m.reach} onChange={(v) => patch('reach', v)} />
          <MetricInput label="Saves" value={m.saves} onChange={(v) => patch('saves', v)} />
          <MetricInput label="Shares" value={m.shares} onChange={(v) => patch('shares', v)} />
          <MetricInput label="Comments" value={m.comments} onChange={(v) => patch('comments', v)} />
          <MetricInput label="DM masuk" value={m.dms} onChange={(v) => patch('dms', v)} />
          <MetricInput label="Klik link" value={m.linkClicks} onChange={(v) => patch('linkClicks', v)} />
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? 'Menyimpan...' : 'Simpan metric'}
        </Button>
      </CardContent>
    </Card>
  )
}

function MetricInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium uppercase tracking-wide text-warm-500">
        {label}
      </label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-md border border-warm-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200"
      />
    </div>
  )
}

function VisualSection({
  channel,
  body,
  slides,
  pieceTitle,
}: {
  channel: string
  body: Record<string, unknown>
  slides: Slide[]
  pieceTitle: string
}) {
  if (channel === 'IG_CAROUSEL') {
    // Source: ContentSlide rows kalau ada (Phase 1 sudah persist), atau
    // bodyJson.slides fallback.
    const fromDb = slides.map((s) => ({
      headline: s.headline,
      body: s.body,
    }))
    const fromBody = Array.isArray(body.slides)
      ? (body.slides as { headline?: string; body?: string }[]).map((s) => ({
          headline: String(s.headline ?? ''),
          body: String(s.body ?? ''),
        }))
      : []
    const slideInputs = fromDb.length > 0 ? fromDb : fromBody
    if (slideInputs.length === 0) {
      return (
        <div className="rounded-md border border-warm-200 bg-warm-50 p-4 text-sm text-warm-500">
          Slide kosong — tidak bisa generate visual.
        </div>
      )
    }
    return <CarouselBuilder slides={slideInputs} pieceTitle={pieceTitle} />
  }

  // WA_STATUS / IG_STORY / IG_POST — single image.
  const c = channel as 'WA_STATUS' | 'IG_STORY' | 'IG_POST'
  return (
    <VisualBuilder
      channel={c}
      initialHeadline={
        typeof body.hook === 'string' ? body.hook : undefined
      }
      initialBody={
        typeof body.body === 'string'
          ? body.body
          : typeof body.stickerText === 'string'
            ? body.stickerText
            : undefined
      }
      initialCta={typeof body.cta === 'string' ? body.cta : undefined}
      initialBrand="Hulao"
      pieceTitle={pieceTitle}
    />
  )
}

function BodyRenderer({
  channel,
  body,
  slides,
}: {
  channel: string
  body: Record<string, unknown>
  slides: Slide[]
}) {
  const fmt = (s: unknown) => (typeof s === 'string' ? s : '')

  return (
    <Card>
      <CardContent className="space-y-3 p-5 text-sm leading-relaxed">
        {/* Hook */}
        {typeof body.hook === 'string' && (
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Hook
            </div>
            <p className="font-semibold text-warm-900">{body.hook}</p>
          </div>
        )}

        {/* Body */}
        {typeof body.body === 'string' && (
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Isi
            </div>
            <p className="whitespace-pre-wrap text-warm-800">{body.body}</p>
          </div>
        )}

        {/* Sticker (IG Story) */}
        {typeof body.stickerText === 'string' && (
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Sticker text
            </div>
            <p className="text-warm-800">{body.stickerText}</p>
          </div>
        )}

        {/* Slides (Carousel) */}
        {(slides.length > 0 || Array.isArray(body.slides)) && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Slides
            </div>
            <div className="space-y-2">
              {(slides.length > 0
                ? slides.map((s) => ({
                    headline: s.headline,
                    body: s.body,
                  }))
                : (body.slides as { headline?: string; body?: string }[])
              ).map((s, i) => (
                <div
                  key={i}
                  className="rounded-md border border-warm-200 bg-warm-50 p-3"
                >
                  <div className="mb-0.5 text-[10px] font-semibold text-primary-700">
                    Slide {i + 1}
                  </div>
                  <p className="font-semibold text-warm-900">{fmt(s.headline)}</p>
                  <p className="mt-1 text-xs text-warm-700">{fmt(s.body)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scenes (Reels/TikTok) */}
        {Array.isArray(body.scenes) && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Storyboard ({(body.scenes as unknown[]).length} scene)
            </div>
            <div className="space-y-2">
              {(body.scenes as { seconds?: string; narration?: string; visual?: string; broll?: string }[]).map(
                (s, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-warm-200 bg-warm-50 p-3 text-xs"
                  >
                    <div className="mb-1 font-semibold text-primary-700">
                      [{fmt(s.seconds)}]
                    </div>
                    <div className="mb-1">
                      <strong className="text-warm-900">Narrasi:</strong>{' '}
                      {fmt(s.narration)}
                    </div>
                    <div className="mb-1 text-warm-700">
                      <strong>Visual:</strong> {fmt(s.visual)}
                    </div>
                    {s.broll && (
                      <div className="text-warm-500">
                        <strong>B-roll:</strong> {fmt(s.broll)}
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* Caption */}
        {typeof body.caption === 'string' && (
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Caption
            </div>
            <p className="whitespace-pre-wrap text-warm-800">{body.caption}</p>
          </div>
        )}

        {/* CTA */}
        {typeof body.cta === 'string' && (
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              CTA
            </div>
            <p className="font-medium text-primary-700">{body.cta}</p>
          </div>
        )}

        {/* Hashtags */}
        {Array.isArray(body.hashtags) && body.hashtags.length > 0 && (
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Hashtags
            </div>
            <p className="text-xs text-blue-600">
              {(body.hashtags as string[]).join(' ')}
            </p>
          </div>
        )}

        {/* Sound suggest */}
        {typeof body.soundSuggest === 'string' && (
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Sound suggest
            </div>
            <p className="text-xs text-warm-600">{body.soundSuggest}</p>
          </div>
        )}

        {/* Image hint */}
        {typeof body.imageHint === 'string' && (
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Visual hint (untuk dibuat manual)
            </div>
            <p className="text-xs italic text-warm-600">{body.imageHint}</p>
          </div>
        )}

        <p className="border-t border-warm-100 pt-2 text-[10px] text-warm-400">
          Channel: {channel}
        </p>
      </CardContent>
    </Card>
  )
}

function formatForClipboard(channel: string, body: Record<string, unknown>): string {
  const lines: string[] = []
  if (typeof body.hook === 'string') lines.push(body.hook)
  if (typeof body.body === 'string') lines.push('', body.body)
  if (typeof body.stickerText === 'string') lines.push('', body.stickerText)
  if (Array.isArray(body.slides)) {
    body.slides.forEach((s, i) => {
      const slide = s as { headline?: string; body?: string }
      lines.push('', `─ Slide ${i + 1} ─`, slide.headline ?? '', slide.body ?? '')
    })
  }
  if (Array.isArray(body.scenes)) {
    body.scenes.forEach((s) => {
      const scene = s as {
        seconds?: string
        narration?: string
        visual?: string
        broll?: string
      }
      lines.push(
        '',
        `[${scene.seconds ?? '?'}]`,
        scene.narration ?? '',
        scene.visual ? `Visual: ${scene.visual}` : '',
        scene.broll ? `B-roll: ${scene.broll}` : '',
      )
    })
  }
  if (typeof body.caption === 'string') lines.push('', '— Caption —', body.caption)
  if (typeof body.cta === 'string') lines.push('', body.cta)
  if (Array.isArray(body.hashtags)) {
    lines.push('', body.hashtags.join(' '))
  }
  if (typeof body.soundSuggest === 'string')
    lines.push('', `Sound: ${body.soundSuggest}`)
  // Ads body — flatten headlines + primary
  if (Array.isArray(body.headlines)) {
    lines.push('', '— Headlines —')
    body.headlines.forEach((h, i) => lines.push(`${i + 1}. ${String(h)}`))
  }
  if (Array.isArray(body.primaryTexts)) {
    lines.push('', '— Primary Text —')
    body.primaryTexts.forEach((t, i) => lines.push(`${String.fromCharCode(65 + i)}. ${String(t)}`))
  }
  if (typeof body.description === 'string' && body.description) {
    lines.push('', `Description: ${body.description}`)
  }
  if (typeof body.ctaButton === 'string' && body.ctaButton) {
    lines.push(`CTA Button: ${body.ctaButton}`)
  }
  return lines.filter(Boolean).join('\n').trim()
}

// ─── Phase 6: Ads renderer ────────────────────────────────────────

function AdsBodyRenderer({
  body,
  adsFormat,
}: {
  body: Record<string, unknown>
  adsFormat: string | null
}) {
  const visualBriefRaw = (body.visualBrief ?? {}) as Record<string, unknown>
  const vb = {
    vibe: typeof visualBriefRaw.vibe === 'string' ? visualBriefRaw.vibe : '',
    colorPalette:
      typeof visualBriefRaw.colorPalette === 'string'
        ? visualBriefRaw.colorPalette
        : '',
    composition:
      typeof visualBriefRaw.composition === 'string'
        ? visualBriefRaw.composition
        : '',
    keyVisuals: Array.isArray(visualBriefRaw.keyVisuals)
      ? (visualBriefRaw.keyVisuals as unknown[]).map((v) => String(v))
      : [],
    overlayCopy:
      typeof visualBriefRaw.overlayCopy === 'string'
        ? visualBriefRaw.overlayCopy
        : '',
  }
  const storyboard = Array.isArray(body.storyboard)
    ? (body.storyboard as Array<Record<string, unknown>>)
    : []

  return (
    <Card>
      <CardContent className="space-y-5 p-5 text-sm">
        {/* Visual brief */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">
            🎨 Visual Brief
          </div>
          <div className="space-y-1.5 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs leading-relaxed">
            {vb.vibe && (
              <div>
                <strong className="text-fuchsia-900">Vibe:</strong>{' '}
                <span className="text-warm-800">{vb.vibe}</span>
              </div>
            )}
            {vb.colorPalette && (
              <div>
                <strong className="text-fuchsia-900">Warna:</strong>{' '}
                <span className="text-warm-800">{vb.colorPalette}</span>
              </div>
            )}
            {vb.composition && (
              <div>
                <strong className="text-fuchsia-900">Komposisi:</strong>{' '}
                <span className="text-warm-800">{vb.composition}</span>
              </div>
            )}
            {vb.keyVisuals.length > 0 && (
              <div>
                <strong className="text-fuchsia-900">Elemen kunci:</strong>
                <ul className="ml-4 list-disc text-warm-800">
                  {vb.keyVisuals.map((kv, i) => (
                    <li key={i}>{kv}</li>
                  ))}
                </ul>
              </div>
            )}
            {vb.overlayCopy && (
              <div>
                <strong className="text-fuchsia-900">Overlay copy:</strong>{' '}
                <span className="font-bold text-warm-900">
                  &ldquo;{vb.overlayCopy}&rdquo;
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Storyboard — kalau VIDEO/CAROUSEL */}
        {storyboard.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">
              🎬 Storyboard ({adsFormat === 'CAROUSEL' ? 'cards' : 'scenes'},{' '}
              {storyboard.length} step)
            </div>
            <div className="space-y-2">
              {storyboard.map((sRaw, i) => {
                const s = {
                  seconds:
                    typeof sRaw.seconds === 'string' ? sRaw.seconds : `${i + 1}`,
                  visual:
                    typeof sRaw.visual === 'string' ? sRaw.visual : '',
                  voiceover:
                    typeof sRaw.voiceover === 'string' ? sRaw.voiceover : '',
                  onScreenText:
                    typeof sRaw.onScreenText === 'string'
                      ? sRaw.onScreenText
                      : '',
                }
                return (
                  <div
                    key={i}
                    className="rounded-md border border-warm-200 bg-warm-50 p-3 text-xs"
                  >
                    <div className="mb-1 font-mono font-semibold text-fuchsia-700">
                      [{s.seconds}]
                    </div>
                    {s.visual && (
                      <div className="mb-1">
                        <strong className="text-warm-900">Visual:</strong>{' '}
                        {s.visual}
                      </div>
                    )}
                    {s.voiceover && (
                      <div className="mb-1 text-warm-700">
                        <strong>Voiceover:</strong> {s.voiceover}
                      </div>
                    )}
                    {s.onScreenText && (
                      <div className="text-warm-600">
                        <strong>On-screen:</strong>{' '}
                        <span className="font-bold">&ldquo;{s.onScreenText}&rdquo;</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <TargetingHintSection raw={body.targetingHint} />

        <p className="border-t border-warm-100 pt-2 text-[10px] text-warm-400">
          Format: {adsFormat ?? '—'}
        </p>
      </CardContent>
    </Card>
  )
}

function TargetingHintSection({ raw }: { raw: unknown }) {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const interests: string[] = Array.isArray(t.interests)
    ? (t.interests as unknown[]).map((x) => String(x))
    : []
  const behavioral: string[] = Array.isArray(t.behavioral)
    ? (t.behavioral as unknown[]).map((x) => String(x))
    : []
  if (interests.length === 0 && behavioral.length === 0) return null
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">
        🎯 Targeting Hint
      </div>
      <div className="rounded-md border border-warm-200 bg-warm-50 p-3 text-xs leading-relaxed">
        {interests.length > 0 && (
          <div>
            <strong>Interests:</strong> {interests.join(', ')}
          </div>
        )}
        {behavioral.length > 0 && (
          <div>
            <strong>Behavioral:</strong> {behavioral.join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}

function AdVariantsSection({
  variants,
  onVariantsChange,
}: {
  variants: AdVariantUI[]
  onVariantsChange: (next: AdVariantUI[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')

  const grouped = variants.reduce<Record<string, AdVariantUI[]>>((acc, v) => {
    if (!acc[v.variantType]) acc[v.variantType] = []
    acc[v.variantType]!.push(v)
    return acc
  }, {})

  const TYPE_LABEL: Record<string, string> = {
    HEADLINE: 'Headlines (5 variant tone)',
    PRIMARY_TEXT: 'Primary Text (3 variant)',
    DESCRIPTION: 'Description',
    CTA: 'CTA Button',
  }

  async function saveValue(variantId: string) {
    const res = await fetch(`/api/content/ads/variants/${variantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: draftValue }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal save variant')
      return
    }
    onVariantsChange(
      variants.map((v) => (v.id === variantId ? { ...v, value: draftValue } : v)),
    )
    setEditingId(null)
    toast.success('Variant tersimpan')
  }

  async function copyVariant(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Browser tidak support copy')
    }
  }

  async function saveMetric(
    variantId: string,
    field: 'impressions' | 'clicks' | 'conversions' | 'spendRp',
    value: string,
  ) {
    const num = value === '' ? null : parseInt(value, 10)
    if (value !== '' && (!Number.isFinite(num) || (num as number) < 0)) {
      toast.error('Angka tidak valid')
      return
    }
    const res = await fetch(`/api/content/ads/variants/${variantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: num }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal update metric')
      return
    }
    onVariantsChange(
      variants.map((v) =>
        v.id === variantId
          ? {
              ...v,
              [field]: num,
              ctr:
                json.data.variant.ctr !== undefined
                  ? json.data.variant.ctr
                  : v.ctr,
            }
          : v,
      ),
    )
  }

  return (
    <div className="space-y-4">
      {(['HEADLINE', 'PRIMARY_TEXT', 'DESCRIPTION', 'CTA'] as const).map((type) => {
        const list = grouped[type] ?? []
        if (list.length === 0) return null
        return (
          <Card key={type}>
            <CardContent className="space-y-2 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700">
                {TYPE_LABEL[type]}
              </h3>
              <div className="space-y-2">
                {list.map((v) => {
                  const label =
                    type === 'HEADLINE'
                      ? `${v.order + 1}.`
                      : type === 'PRIMARY_TEXT'
                        ? `${String.fromCharCode(65 + v.order)}.`
                        : ''
                  return (
                    <div
                      key={v.id}
                      className="rounded-md border border-warm-200 bg-warm-50 p-3 text-xs"
                    >
                      <div className="flex items-start gap-2">
                        {label && (
                          <span className="font-mono font-bold text-fuchsia-600">
                            {label}
                          </span>
                        )}
                        {editingId === v.id ? (
                          <textarea
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            rows={Math.max(
                              1,
                              Math.ceil(draftValue.length / 80),
                            )}
                            className="flex-1 rounded border border-fuchsia-300 bg-white p-2 text-xs"
                          />
                        ) : (
                          <p className="flex-1 leading-relaxed text-warm-900">
                            {v.value}
                          </p>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex gap-1.5">
                          {editingId === v.id ? (
                            <>
                              <button
                                onClick={() => saveValue(v.id)}
                                className="text-[10px] font-medium text-emerald-700 hover:underline"
                              >
                                Simpan
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-[10px] text-warm-500 hover:underline"
                              >
                                Batal
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => copyVariant(v.value)}
                                className="text-[10px] font-medium text-blue-600 hover:underline"
                              >
                                Copy
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(v.id)
                                  setDraftValue(v.value)
                                }}
                                className="text-[10px] text-warm-500 hover:underline"
                              >
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                        {/* Metric per variant — hanya tampil untuk HEADLINE & PRIMARY_TEXT */}
                        {(type === 'HEADLINE' || type === 'PRIMARY_TEXT') && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-warm-500">
                            <MetricInline
                              label="Impr"
                              value={v.impressions}
                              onSave={(val) => saveMetric(v.id, 'impressions', val)}
                            />
                            <MetricInline
                              label="Klik"
                              value={v.clicks}
                              onSave={(val) => saveMetric(v.id, 'clicks', val)}
                            />
                            <MetricInline
                              label="Conv"
                              value={v.conversions}
                              onSave={(val) => saveMetric(v.id, 'conversions', val)}
                            />
                            <MetricInline
                              label="Spend"
                              value={v.spendRp}
                              onSave={(val) => saveMetric(v.id, 'spendRp', val)}
                              isCurrency
                            />
                            {v.ctr !== null && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">
                                CTR {(v.ctr * 100).toFixed(2)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
      {variants.length === 0 && (
        <div className="rounded-md border border-dashed border-warm-200 bg-warm-50 p-4 text-center text-xs text-warm-500">
          Variant belum ada — re-generate ads piece untuk dapat 5 headline + 3
          primary text + CTA.
        </div>
      )}
    </div>
  )
}

function MetricInline({
  label,
  value,
  onSave,
  isCurrency,
}: {
  label: string
  value: number | null
  onSave: (v: string) => void
  isCurrency?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(value === null ? '' : String(value))
          setEditing(true)
        }}
        className="rounded bg-white px-1.5 py-0.5 hover:bg-warm-100"
      >
        {label}:{' '}
        <strong className="text-warm-700">
          {value === null
            ? '—'
            : isCurrency
              ? `Rp ${value.toLocaleString('id-ID')}`
              : value.toLocaleString('id-ID')}
        </strong>
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <span>{label}:</span>
      <input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== (value === null ? '' : String(value))) {
            onSave(draft)
          }
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-16 rounded border border-fuchsia-300 px-1 py-0.5 text-[10px]"
      />
    </span>
  )
}
