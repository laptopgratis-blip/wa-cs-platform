'use client'

// LiveEmbedPanel — sidebar editor LP untuk embed satu Live Room ke halaman.
// Flow simpel (anti-bingung): pilih room → "Sisipkan di bawah headline".
// Marker <div data-hulao-live-embed> ditaruh setelah H1; widget publik
// (hulao-live-embed.js) mengganti marker dengan iframe room saat LP dipublish.
// Pengaturan lanjutan (gate form, ukuran, floating) ada di halaman config lama.
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Trash2,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  hasLiveEmbedMarker,
  insertLiveEmbedMarker,
  removeLiveEmbedMarker,
} from '@/lib/lp/html-mutation'

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
      const res = await fetch(`/api/lp/${lpId}/live-embed`, { cache: 'no-store' })
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
        ? { liveRoomId: payload.embed.liveRoomId, isActive: payload.embed.isActive }
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
    <div className="border-b border-warm-200 bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-warm-50"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <Video className="size-4 text-primary-500" />
          <span className="font-display text-sm font-bold text-warm-900">
            Embed Live Room
          </span>
          {active ? (
            <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700">
              Aktif
            </span>
          ) : null}
        </div>
        {open ? (
          <ChevronUp className="size-4 text-warm-500" />
        ) : (
          <ChevronDown className="size-4 text-warm-500" />
        )}
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-3 pt-1">
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-warm-500">
              <Loader2 className="size-4 animate-spin" /> Memuat Live Room…
            </div>
          ) : rooms.length === 0 ? (
            <p className="rounded-md bg-warm-50 px-3 py-2 text-[11px] leading-relaxed text-warm-600">
              Belum ada Live Room aktif.{' '}
              <a
                href="/live-rooms/new"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary-600 underline"
              >
                Buat Live Room dulu →
              </a>
            </p>
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-warm-600">
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
                        className="size-4 accent-primary-500"
                        checked={checked}
                        onChange={() => setSelectedRoomId(r.id)}
                      />
                      <Video className="size-4 flex-shrink-0 text-warm-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-warm-800">
                        {r.name}
                      </span>
                      {embed?.liveRoomId === r.id && active ? (
                        <span className="flex-shrink-0 text-[10px] font-semibold text-emerald-600">
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
                  className="bg-primary-500 text-xs text-white hover:bg-primary-600"
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
                    className="text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="mr-1 size-3.5" /> Hapus dari halaman
                  </Button>
                ) : null}
              </div>

              {active && currentRoom ? (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-[10px] leading-relaxed text-emerald-700">
                  ✓ <strong>{currentRoom.name}</strong> tampil di bawah headline.
                  Penanda 📺 di preview hanya petunjuk posisi — room asli muncul
                  saat LP dipublish.
                </p>
              ) : (
                <p className="text-[10px] leading-relaxed text-warm-500">
                  Embed tampil saat LP <strong>dipublish</strong>. Di editor ini
                  hanya muncul penanda posisi (📺).
                </p>
              )}

              <a
                href={`/landing-pages/${lpId}/live-embed`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary-600 hover:underline"
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
