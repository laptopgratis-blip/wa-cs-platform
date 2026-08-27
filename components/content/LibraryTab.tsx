'use client'

// Library tab — list ContentPiece dgn filter channel/status, copy-to-clipboard, mark posted/archived.
import {
  Archive,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  FolderOpen,
  Loader2,
  Target,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { contentPieceStatusMeta, funnelStageMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Piece {
  id: string
  channel: string
  funnelStage: string
  format: string
  title: string
  bodyJson: Record<string, unknown>
  status: string
  tokensCharged: number
  scheduledFor: string | null
  postedAt: string | null
  createdAt: string
  brief?: { lpId?: string; manualTitle?: string | null } | null
  pieceType?: string
  adsPlatform?: string | null
  adsFormat?: string | null
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

export function LibraryTab() {
  const [pieces, setPieces] = useState<Piece[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<{
    channel?: string
    status?: string
    pieceType?: string
  }>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const url = new URL('/api/content/library', window.location.origin)
    if (filter.channel) url.searchParams.set('channel', filter.channel)
    if (filter.status) url.searchParams.set('status', filter.status)
    if (filter.pieceType) url.searchParams.set('pieceType', filter.pieceType)
    fetch(url.pathname + url.search, { cache: 'no-store' })
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
  }, [filter])

  async function copyToClipboard(piece: Piece) {
    const text = formatPieceForClipboard(piece)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(piece.id)
      setTimeout(() => setCopiedId(null), 2000)
      toast.success('Copied — paste di app sosmed kamu')
    } catch {
      toast.error('Browser tidak support copy. Buka detail untuk select text.')
    }
  }

  async function updateStatus(pieceId: string, status: string) {
    const res = await fetch(`/api/content/pieces/${pieceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal update')
      return
    }
    setPieces((prev) =>
      prev.map((p) =>
        p.id === pieceId
          ? {
              ...p,
              status,
              postedAt:
                status === 'POSTED' ? new Date().toISOString() : p.postedAt,
            }
          : p,
      ),
    )
    toast.success(`Status: ${contentPieceStatusMeta[status]?.label ?? status}`)
  }

  async function schedulePiece(pieceId: string) {
    // Native datetime-local prompt — simple, no extra deps. User isi tanggal+jam.
    const now = new Date()
    const defaultIso = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16)
    const input = window.prompt(
      'Jadwalkan posting (format: YYYY-MM-DD HH:MM, contoh besok jam 9 pagi):',
      defaultIso.replace('T', ' '),
    )
    if (!input) return
    const parsed = parseScheduleInput(input)
    if (!parsed) {
      toast.error('Format tidak valid. Pakai YYYY-MM-DD HH:MM')
      return
    }
    const res = await fetch(`/api/content/pieces/${pieceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledFor: parsed.toISOString() }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal schedule')
      return
    }
    setPieces((prev) =>
      prev.map((p) =>
        p.id === pieceId ? { ...p, scheduledFor: parsed.toISOString() } : p,
      ),
    )
    toast.success(
      `Dijadwalkan ${parsed.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`,
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filter.pieceType ?? ''}
          onChange={(e) =>
            setFilter((f) => ({ ...f, pieceType: e.target.value || undefined }))
          }
          className="border-warm-300 rounded-md border bg-white px-2 py-1 text-xs"
        >
          <option value="">Organik + Iklan</option>
          <option value="ORGANIC">Konten organik</option>
          <option value="ADS">Iklan berbayar</option>
        </select>
        <select
          value={filter.channel ?? ''}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              channel: e.target.value || undefined,
            }))
          }
          className="border-warm-300 rounded-md border bg-white px-2 py-1 text-xs"
        >
          <option value="">Semua channel</option>
          {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filter.status ?? ''}
          onChange={(e) =>
            setFilter((f) => ({ ...f, status: e.target.value || undefined }))
          }
          className="border-warm-300 rounded-md border bg-white px-2 py-1 text-xs"
        >
          <option value="">Semua status</option>
          {Object.entries(contentPieceStatusMeta).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-warm-500 flex items-center gap-2 py-8 text-sm">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      )}

      {!loading && pieces.length === 0 && (
        <EmptyState
          bordered
          icon={FolderOpen}
          title="Belum ada konten di library"
          description="Generate ide dulu di tab kiri, lalu pilih ide yg mau di-bikin."
        />
      )}

      {!loading && pieces.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {pieces.map((p) => {
            const funnel = funnelStageMeta[p.funnelStage]
            const status = contentPieceStatusMeta[p.status]
            return (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap gap-1">
                    {p.pieceType === 'ADS' && (
                      <StatusBadge tone="brand" label="Iklan" icon={Target} />
                    )}
                    <Badge className="bg-warm-100 text-warm-700 text-xs">
                      {CHANNEL_LABEL[p.channel] ?? p.channel}
                    </Badge>
                    {funnel && (
                      <StatusBadge tone={funnel.tone} label={funnel.label} />
                    )}
                    {status && (
                      <StatusBadge tone={status.tone} label={status.label} />
                    )}
                  </div>

                  <Link
                    href={`/content/pieces/${p.id}`}
                    className="block hover:underline"
                  >
                    <h3 className="text-warm-900 text-sm leading-snug font-semibold">
                      {p.title}
                    </h3>
                  </Link>

                  <p className="text-warm-600 line-clamp-3 text-xs">
                    {previewBody(p.bodyJson)}
                  </p>

                  <div className="border-warm-100 text-warm-500 flex items-center justify-between border-t pt-2 text-xs">
                    <span>
                      {p.tokensCharged.toLocaleString('id-ID')} tk ·{' '}
                      {new Date(p.createdAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                    {p.scheduledFor && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                          TONES.info.bg,
                          TONES.info.text,
                        )}
                      >
                        <CalendarClock className="size-3" aria-hidden />
                        {new Date(p.scheduledFor).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(p)}
                      className="flex-1 text-xs"
                    >
                      {copiedId === p.id ? (
                        <>
                          <ClipboardCheck
                            className={cn('mr-1 size-3.5', TONES.success.text)}
                          />
                          Tercopy
                        </>
                      ) : (
                        <>
                          <Clipboard className="mr-1 size-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                    {p.status !== 'POSTED' && p.status !== 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => schedulePiece(p.id)}
                        title="Jadwalkan posting"
                      >
                        <CalendarPlus className="size-3.5" />
                      </Button>
                    )}
                    {p.status !== 'POSTED' && p.status !== 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(p.id, 'POSTED')}
                        title="Tandai sudah di-post"
                      >
                        <CheckCircle2
                          className={cn('size-3.5', TONES.success.text)}
                        />
                      </Button>
                    )}
                    {p.status !== 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(p.id, 'ARCHIVED')}
                        title="Arsip"
                      >
                        <Archive className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatPieceForClipboard(piece: Piece): string {
  const body = piece.bodyJson as Record<string, unknown>
  const lines: string[] = []
  if (typeof body.hook === 'string') lines.push(body.hook)
  if (typeof body.body === 'string') lines.push('', body.body)
  if (Array.isArray(body.slides)) {
    body.slides.forEach((s, i) => {
      const slide = s as { headline?: string; body?: string }
      lines.push(
        '',
        `Slide ${i + 1}: ${slide.headline ?? ''}`,
        slide.body ?? '',
      )
    })
    if (typeof body.caption === 'string') lines.push('', '---', body.caption)
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
        `[${scene.seconds ?? '?'}] ${scene.narration ?? ''}`,
        `   Visual: ${scene.visual ?? ''}`,
        scene.broll ? `   B-roll: ${scene.broll}` : '',
      )
    })
    if (typeof body.caption === 'string') lines.push('', '---', body.caption)
  }
  if (typeof body.cta === 'string') lines.push('', body.cta)
  if (Array.isArray(body.hashtags)) {
    lines.push('', body.hashtags.join(' '))
  }
  return lines.filter(Boolean).join('\n').trim()
}

// Parse "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM" → Date | null.
function parseScheduleInput(input: string): Date | null {
  const trimmed = input.trim().replace(' ', 'T')
  // Tambahkan :00 detik kalau belum ada.
  const withSec = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00`
    : trimmed
  const d = new Date(withSec)
  return Number.isNaN(d.getTime()) ? null : d
}

function previewBody(bodyJson: Record<string, unknown>): string {
  // Ads body — show first headline
  if (Array.isArray(bodyJson.headlines) && bodyJson.headlines.length > 0) {
    return String(bodyJson.headlines[0] ?? '')
  }
  if (typeof bodyJson.hook === 'string') return bodyJson.hook
  if (Array.isArray(bodyJson.slides)) {
    const first = bodyJson.slides[0] as { headline?: string }
    return first?.headline ?? ''
  }
  return ''
}
