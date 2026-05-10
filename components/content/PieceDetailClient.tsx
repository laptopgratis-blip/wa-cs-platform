'use client'

// PieceDetailClient — render channel-specific body + actions
// (copy, mark posted/archived, edit body raw via JSON textarea).
import {
  Archive,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Edit3,
  Save,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Slide {
  id: string
  slideIndex: number
  headline: string
  body: string
}

interface PieceData {
  id: string
  title: string
  channel: string
  funnelStage: string
  format: string
  status: string
  tokensCharged: number
  bodyJson: Record<string, unknown>
  slides: Slide[]
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

export function PieceDetailClient({ piece }: { piece: PieceData }) {
  const [body, setBody] = useState(piece.bodyJson)
  const [status, setStatus] = useState(piece.status)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(JSON.stringify(piece.bodyJson, null, 2))
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

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

      {/* Body render */}
      {!editing && <BodyRenderer channel={piece.channel} body={body} slides={piece.slides} />}

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

      <p className="text-[11px] text-warm-400">
        Token kepake bikin konten ini: {piece.tokensCharged.toLocaleString('id-ID')}
      </p>
    </div>
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
  return lines.filter(Boolean).join('\n').trim()
}
