'use client'

// LiveEmbedPanel — sidebar editor LP untuk embed satu Live Room ke halaman.
// Flow simpel (anti-bingung): pilih room → "Sisipkan di bawah headline".
// Marker <div data-hulao-live-embed> ditaruh setelah H1; widget publik
// (hulao-live-embed.js) mengganti marker dengan iframe room saat LP dipublish.
// Pengaturan lanjutan (gate form, ukuran, floating) ada di halaman config lama.
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Trash2,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  hasLiveEmbedMarker,
  insertLiveEmbedMarker,
  removeLiveEmbedMarker,
} from '@/lib/lp/html-mutation'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface RoomOption {
  id: string
  slug: string
  name: string
  isActive: boolean
}

interface EmbedState {
  liveRoomId: string
  isActive: boolean
}

// Field config gate/ukuran yang ingin dipertahankan saat update (jangan
// ke-reset ke default kalau owner sudah set lewat halaman lanjutan).
type EmbedConfig = Record<string, unknown>

const PRESERVED_KEYS = [
  'gateMode',
  'gateFields',
  'gateTriggerSec',
  'gateTriggerOnChat',
  'ctaLabel',
  'autoplay',
  'mutedDefault',
  'widthPx',
  'heightPx',
] as const

export function LiveEmbedPanel({
  lpId,
  html,
  onChange,
}: {
  lpId: string
  html: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [embed, setEmbed] = useState<EmbedState | null>(null)
  const [embedFull, setEmbedFull] = useState<EmbedConfig | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState('')

  const markerInPage = hasLiveEmbedMarker(html)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/lp/${lpId}/live-embed`, {
        cache: 'no-store',
      })
      const json = (await res.json()) as {
        success?: boolean
        data?: {
          embed: (EmbedState & Record<string, unknown>) | null
          availableRooms: RoomOption[]
        }
        embed?: (EmbedState & Record<string, unknown>) | null
        availableRooms?: RoomOption[]
      }
      // API bisa balikin {success,data:{...}} atau {embed,availableRooms} —
      // handle dua-duanya defensif.
      const payload = json.data ?? json
      const rs = (payload.availableRooms ?? []).filter((r) => r.isActive)
      setRooms(rs)
      const e = payload.embed
        ? {
            liveRoomId: payload.embed.liveRoomId,
            isActive: payload.embed.isActive,
          }
        : null
      setEmbed(e)
      setEmbedFull((payload.embed as EmbedConfig | null) ?? null)
      setSelectedRoomId(e?.liveRoomId ?? rs[0]?.id ?? '')
    } catch {
      toast.error('Gagal memuat data Live Room')
    } finally {
      setLoading(false)
    }
  }, [lpId])

  // Lazy-load saat panel pertama dibuka.
  useEffect(() => {
    if (open && rooms.length === 0 && !loading) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleInsert() {
    if (!selectedRoomId) {
      toast.error('Pilih Live Room dulu')
      return
    }
    setSaving(true)
    try {
      // Pertahankan config gate/ukuran yang sudah ada (kalau owner pernah set
      // di halaman lanjutan) — jangan ke-reset ke default saat update.
      const preserved: EmbedConfig = {}
      if (embedFull) {
        for (const k of PRESERVED_KEYS) {
          if (embedFull[k] !== undefined && embedFull[k] !== null) {
            preserved[k] = embedFull[k]
          }
        }
      }
      const res = await fetch(`/api/lp/${lpId}/live-embed`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...preserved,
          liveRoomId: selectedRoomId,
          position: 'inline',
          isActive: true,
        }),
      })
      const json = (await res.json()) as {
        success?: boolean
        error?: string
        data?: { embed?: EmbedConfig }
      }
      if (res.ok && json.success !== false) {
        // Sisipkan marker di bawah headline kalau belum ada.
        if (!hasLiveEmbedMarker(html)) {
          onChange(insertLiveEmbedMarker(html))
        }
        setEmbed({ liveRoomId: selectedRoomId, isActive: true })
        if (json.data?.embed) setEmbedFull(json.data.embed)
        const room = rooms.find((r) => r.id === selectedRoomId)
        toast.success(
          `Live Room "${room?.name ?? ''}" disisipkan di bawah headline. Tampil saat LP dipublish.`,
        )
      } else {
        toast.error(json.error ?? 'Gagal menyimpan embed')
      }
    } catch {
      toast.error('Gagal menyimpan embed')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setSaving(true)
    try {
      await fetch(`/api/lp/${lpId}/live-embed`, { method: 'DELETE' })
      if (hasLiveEmbedMarker(html)) onChange(removeLiveEmbedMarker(html))
      setEmbed(null)
      setEmbedFull(null)
      toast.success('Live Room dihapus dari halaman')
    } catch {
      toast.error('Gagal menghapus embed')
    } finally {
      setSaving(false)
    }
  }

  const active = Boolean(embed?.isActive) && markerInPage
  const currentRoom = rooms.find((r) => r.id === embed?.liveRoomId)

  return (
    <div className="border-warm-200 bg-card border-b">
      <button
        type="button"
        className="hover:bg-warm-50 flex w-full items-center justify-between px-4 py-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <Video className="text-primary-500 size-4" />
          <span className="font-display text-warm-900 text-sm font-semibold">
            Embed Live Room
          </span>
          {active ? <StatusBadge tone="success" label="Aktif" /> : null}
        </div>
        {open ? (
          <ChevronUp className="text-warm-500 size-4" />
        ) : (
          <ChevronDown className="text-warm-500 size-4" />
        )}
      </button>

      {open && (
        <div className="space-y-3 px-4 pt-1 pb-3">
          {loading ? (
            <div className="text-warm-500 flex items-center gap-2 py-3 text-xs">
              <Loader2 className="size-4 animate-spin" /> Memuat Live Room…
            </div>
          ) : rooms.length === 0 ? (
            <p className="bg-warm-50 text-warm-600 rounded-md px-3 py-2 text-xs leading-relaxed">
              Belum ada Live Room aktif.{' '}
              <a
                href="/live-rooms/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 font-semibold underline"
              >
                Buat Live Room dulu →
              </a>
            </p>
          ) : (
            <>
              <p className="text-warm-600 text-xs leading-relaxed">
                Pilih host/room yang mau tampil. Embed disisipkan{' '}
                <span className="font-semibold">tepat di bawah headline</span>{' '}
                halaman.
              </p>

              <div className="space-y-1.5">
                {rooms.map((r) => {
                  const checked = selectedRoomId === r.id
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition ${
                        checked
                          ? 'border-primary-400 bg-primary-50'
                          : 'border-warm-200 hover:bg-warm-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="live-embed-room"
                        className="accent-primary-500 size-4"
                        checked={checked}
                        onChange={() => setSelectedRoomId(r.id)}
                      />
                      <Video className="text-warm-400 size-4 flex-shrink-0" />
                      <span className="text-warm-800 min-w-0 flex-1 truncate text-sm">
                        {r.name}
                      </span>
                      {embed?.liveRoomId === r.id && active ? (
                        <span
                          className={cn(
                            'flex-shrink-0 text-xs font-semibold',
                            TONES.success.text,
                          )}
                        >
                          terpasang
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  type="button"
                  onClick={handleInsert}
                  disabled={saving || !selectedRoomId}
                  className="text-xs"
                >
                  {saving ? (
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                  ) : (
                    <Video className="mr-1 size-3.5" />
                  )}
                  {active ? 'Perbarui embed' : 'Sisipkan di bawah headline'}
                </Button>
                {active ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={handleRemove}
                    disabled={saving}
                    className="text-destructive hover:bg-destructive/10 text-xs"
                  >
                    <Trash2 className="mr-1 size-3.5" /> Hapus dari halaman
                  </Button>
                ) : null}
              </div>

              {active && currentRoom ? (
                <p
                  className={cn(
                    'rounded-md px-3 py-2 text-xs leading-relaxed',
                    TONES.success.bg,
                    TONES.success.text,
                  )}
                >
                  <Check className="mr-1 inline size-3" aria-hidden />
                  <strong>{currentRoom.name}</strong> tampil di bawah headline.
                  Penanda LIVE ROOM di preview hanya petunjuk posisi — room
                  asli muncul saat LP dipublish.
                </p>
              ) : (
                <p className="text-warm-500 text-xs leading-relaxed">
                  Embed tampil saat LP <strong>dipublish</strong>. Di editor ini
                  hanya muncul penanda posisi bertuliskan LIVE ROOM.
                </p>
              )}

              <a
                href={`/landing-pages/${lpId}/live-embed`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                Pengaturan lanjutan (gate form, ukuran, floating)
                <ExternalLink className="size-3" />
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
