'use client'

// Config panel Live AI Embed di LP — owner pilih LiveRoom, atur gate, position, dll.
// Endpoint: GET/PUT/DELETE /api/lp/[lpId]/live-embed
import {
  AlertTriangle,
  AlignLeft,
  ArrowLeft,
  Loader2,
  PictureInPicture2,
  Save,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Button } from '@/components/ui/button'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

type GateMode = 'REQUIRED' | 'OPTIONAL' | 'HYBRID' | 'OFF'
type GateField = 'name' | 'phone' | 'email' | 'city' | 'productInterest'
type Position =
  'inline' | 'floating-br' | 'floating-bl' | 'floating-tr' | 'floating-tl'

interface AvailableRoom {
  id: string
  slug: string
  name: string
  isActive: boolean
  hostTemplate: { mode: 'TTS_GENERATIVE' | 'NATIVE_LIBRARY' }
}

interface EmbedConfig {
  id?: string
  liveRoomId: string
  gateMode: GateMode
  gateFields: GateField[]
  gateTriggerSec: number
  gateTriggerOnChat: boolean
  ctaLabel: string
  position: Position
  autoplay: boolean
  mutedDefault: boolean
  widthPx: number
  heightPx: number
  isActive: boolean
}

const DEFAULT_CONFIG: EmbedConfig = {
  liveRoomId: '',
  gateMode: 'HYBRID',
  gateFields: ['name', 'phone'],
  gateTriggerSec: 30,
  gateTriggerOnChat: true,
  ctaLabel: 'Tanya host live',
  position: 'inline',
  autoplay: true,
  mutedDefault: true,
  widthPx: 420,
  heightPx: 720,
  isActive: true,
}

export function LpLiveEmbedConfig({
  lpId,
  lpSlug,
  lpTitle,
}: {
  lpId: string
  lpSlug: string
  lpTitle: string
}) {
  const router = useRouter()
  const [config, setConfig] = useState<EmbedConfig>(DEFAULT_CONFIG)
  const [rooms, setRooms] = useState<AvailableRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [hasConfig, setHasConfig] = useState(false)

  useEffect(() => {
    let canceled = false
    fetch(`/api/lp/${lpId}/live-embed`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (canceled) return
        if (json.success && json.data) {
          setRooms(json.data.availableRooms ?? [])
          if (json.data.embed) {
            setHasConfig(true)
            setConfig({
              id: json.data.embed.id,
              liveRoomId: json.data.embed.liveRoomId,
              gateMode: json.data.embed.gateMode,
              gateFields: json.data.embed.gateFields ?? ['name', 'phone'],
              gateTriggerSec: json.data.embed.gateTriggerSec,
              gateTriggerOnChat: json.data.embed.gateTriggerOnChat,
              ctaLabel: json.data.embed.ctaLabel,
              position: json.data.embed.position,
              autoplay: json.data.embed.autoplay,
              mutedDefault: json.data.embed.mutedDefault,
              widthPx: json.data.embed.widthPx,
              heightPx: json.data.embed.heightPx,
              isActive: json.data.embed.isActive,
            })
          }
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => !canceled && setLoading(false))
    return () => {
      canceled = true
    }
  }, [lpId])

  const handleSave = async () => {
    if (!config.liveRoomId) {
      setError('Pilih LiveRoom dulu.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/lp/${lpId}/live-embed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Gagal save')
        return
      }
      setHasConfig(true)
      setSavedAt(new Date().toLocaleTimeString('id-ID'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setConfirmDeleteOpen(false)
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/lp/${lpId}/live-embed`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Gagal hapus')
        return
      }
      setHasConfig(false)
      setConfig(DEFAULT_CONFIG)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  const toggleField = (f: GateField) => {
    setConfig((prev) => ({
      ...prev,
      gateFields: prev.gateFields.includes(f)
        ? prev.gateFields.filter((x) => x !== f)
        : [...prev.gateFields, f],
    }))
  }

  if (loading) {
    return (
      <PageContainer width="narrow">
        <CardGridSkeleton count={2} />
      </PageContainer>
    )
  }

  return (
    <PageContainer width="narrow">
      <div>
        <Link
          href={`/landing-pages/${lpId}/edit`}
          className="text-warm-500 hover:text-warm-700 mb-2 inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-1 size-4" /> Kembali ke editor LP
        </Link>
        <PageHeader
          title="Live AI Embed"
          description={
            <>
              Hubungkan LP <strong>{lpTitle}</strong> dengan satu Live Room.
              Widget muncul otomatis di{' '}
              <code className="bg-warm-100 rounded px-1.5 py-0.5 text-xs">
                /p/{lpSlug}
              </code>
              .
            </>
          }
          actions={
            hasConfig ? (
              <Button
                variant="outline"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={deleting}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1 size-4" />
                {deleting ? 'Menghapus…' : 'Hapus'}
              </Button>
            ) : undefined
          }
        />
      </div>

      {rooms.length === 0 && (
        <div
          className={cn(
            'rounded-xl border p-4 text-sm',
            TONES.warning.bg,
            TONES.warning.border,
            TONES.warning.text,
          )}
        >
          Belum ada Live Room. Bikin dulu di{' '}
          <Link href="/live-rooms/new" className="font-medium underline">
            /live-rooms/new
          </Link>{' '}
          sebelum embed di LP.
        </div>
      )}

      <section className="border-warm-200 bg-card space-y-4 rounded-xl border p-6">
        <h2 className="text-base font-medium">1. Pilih Live Room</h2>
        <div className="grid gap-2">
          {rooms.map((r) => (
            <label
              key={r.id}
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition ${
                config.liveRoomId === r.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-warm-200 hover:border-warm-300'
              }`}
            >
              <div className="flex items-center">
                <input
                  type="radio"
                  name="liveRoomId"
                  checked={config.liveRoomId === r.id}
                  onChange={() =>
                    setConfig((p) => ({ ...p, liveRoomId: r.id }))
                  }
                  className="mr-3"
                />
                <div>
                  <div className="text-warm-900 font-medium">{r.name}</div>
                  <div className="text-warm-500 text-xs">
                    /live/{r.slug} ·{' '}
                    {r.hostTemplate.mode === 'NATIVE_LIBRARY'
                      ? 'Klip Live'
                      : 'TTS'}
                    {!r.isActive && (
                      <span className={cn('ml-1', TONES.warning.text)}>
                        <AlertTriangle
                          className="mr-0.5 inline size-3"
                          aria-hidden
                        />
                        tidak aktif
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="border-warm-200 bg-card space-y-4 rounded-xl border p-6">
        <h2 className="text-base font-medium">
          2. Mode Gate (wajib isi nama+WA)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                v: 'REQUIRED',
                label: 'Wajib',
                desc: 'Form blocking — harus isi dulu baru nonton',
              },
              {
                v: 'OPTIONAL',
                label: 'Opsional',
                desc: 'Form muncul tapi ada tombol "lewati"',
              },
              {
                v: 'HYBRID',
                label: 'Hybrid (rekomendasi)',
                desc: 'Auto-play; gate trigger di detik N atau klik chat',
              },
              {
                v: 'OFF',
                label: 'Mati',
                desc: 'Tidak ada gate, pure tontonan (cocok SEO/showcase)',
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.v}
              className={`flex cursor-pointer rounded-lg border p-3 transition ${
                config.gateMode === opt.v
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-warm-200 hover:border-warm-300'
              }`}
            >
              <input
                type="radio"
                name="gateMode"
                checked={config.gateMode === opt.v}
                onChange={() => setConfig((p) => ({ ...p, gateMode: opt.v }))}
                className="mt-1 mr-3"
              />
              <div>
                <div className="text-warm-900 font-medium">{opt.label}</div>
                <div className="text-warm-500 text-xs">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {config.gateMode === 'HYBRID' && (
          <div className="bg-warm-50 space-y-3 rounded-lg p-4">
            <label className="block">
              <span className="text-warm-700 text-xs font-medium">
                Gate trigger setelah (detik)
              </span>
              <input
                type="number"
                min={0}
                max={600}
                value={config.gateTriggerSec}
                onChange={(e) =>
                  setConfig((p) => ({
                    ...p,
                    gateTriggerSec: parseInt(e.target.value) || 0,
                  }))
                }
                className="border-warm-300 mt-1 w-32 rounded-lg border px-3 py-1.5 text-sm"
              />
              <span className="text-warm-500 ml-2 text-xs">
                0 = tidak pakai timer, tunggu klik chat
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.gateTriggerOnChat}
                onChange={(e) =>
                  setConfig((p) => ({
                    ...p,
                    gateTriggerOnChat: e.target.checked,
                  }))
                }
                className="mr-2"
              />
              <span className="text-warm-700 text-xs">
                Trigger juga saat viewer klik area chat
              </span>
            </label>
          </div>
        )}

        {config.gateMode !== 'OFF' && (
          <div>
            <div className="text-warm-700 text-xs font-medium">
              Field yang dikumpulkan:
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                ['name', 'phone', 'email', 'city', 'productInterest'] as const
              ).map((f) => (
                <label
                  key={f}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                    config.gateFields.includes(f)
                      ? 'border-primary-500 bg-primary-100 text-primary-700'
                      : 'border-warm-300 text-warm-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={config.gateFields.includes(f)}
                    onChange={() => toggleField(f)}
                    className="hidden"
                  />
                  {f}
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="border-warm-200 bg-card space-y-4 rounded-xl border p-6">
        <h2 className="text-base font-medium">3. Posisi & tampilan</h2>
        <div>
          <span className="text-warm-700 text-xs font-medium">
            Posisi widget:
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                'inline',
                'floating-br',
                'floating-bl',
                'floating-tr',
                'floating-tl',
              ] as const
            ).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, position: p }))}
                className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs ${
                  config.position === p
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-warm-200 text-warm-600'
                }`}
              >
                {p === 'inline' ? (
                  <AlignLeft className="size-4 shrink-0" aria-hidden />
                ) : (
                  <PictureInPicture2 className="size-4 shrink-0" aria-hidden />
                )}
                {p === 'inline'
                  ? 'Inline'
                  : p.replace('floating-', '').toUpperCase()}
              </button>
            ))}
          </div>
          {config.position === 'inline' && (
            <p className="text-warm-500 mt-2 text-xs">
              Owner paste{' '}
              <code className="bg-warm-100 rounded px-1.5 py-0.5">{`<div data-hulao-live-embed></div>`}</code>{' '}
              di HTML LP untuk pilih posisi. Tanpa marker, widget muncul di
              akhir halaman.
            </p>
          )}
        </div>

        {config.position === 'inline' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-warm-700 text-xs font-medium">
                Width (px)
              </span>
              <input
                type="number"
                min={280}
                max={1200}
                value={config.widthPx}
                onChange={(e) =>
                  setConfig((p) => ({
                    ...p,
                    widthPx: parseInt(e.target.value) || 420,
                  }))
                }
                className="border-warm-300 mt-1 w-full rounded-lg border px-3 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-warm-700 text-xs font-medium">
                Height (px)
              </span>
              <input
                type="number"
                min={400}
                max={1600}
                value={config.heightPx}
                onChange={(e) =>
                  setConfig((p) => ({
                    ...p,
                    heightPx: parseInt(e.target.value) || 720,
                  }))
                }
                className="border-warm-300 mt-1 w-full rounded-lg border px-3 py-1.5 text-sm"
              />
            </label>
          </div>
        )}

        <label className="block">
          <span className="text-warm-700 text-xs font-medium">
            CTA label (untuk tombol floating)
          </span>
          <input
            type="text"
            value={config.ctaLabel}
            onChange={(e) =>
              setConfig((p) => ({ ...p, ctaLabel: e.target.value }))
            }
            className="border-warm-300 mt-1 w-full rounded-lg border px-3 py-1.5 text-sm"
          />
        </label>

        <label className="flex items-center">
          <input
            type="checkbox"
            checked={config.autoplay}
            onChange={(e) =>
              setConfig((p) => ({ ...p, autoplay: e.target.checked }))
            }
            className="mr-2"
          />
          <span className="text-warm-700 text-xs">
            Auto-play saat halaman load
          </span>
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={config.mutedDefault}
            onChange={(e) =>
              setConfig((p) => ({ ...p, mutedDefault: e.target.checked }))
            }
            className="mr-2"
          />
          <span className="text-warm-700 text-xs">
            Mute by default (rekomendasi — Chrome block autoplay+audio)
          </span>
        </label>
      </section>

      <section className="border-warm-200 bg-card rounded-xl border p-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={config.isActive}
            onChange={(e) =>
              setConfig((p) => ({ ...p, isActive: e.target.checked }))
            }
            className="mr-2"
          />
          <span className="text-warm-900 text-sm font-medium">
            Aktifkan embed
          </span>
        </label>
        <p className="text-warm-500 mt-1 text-xs">
          Matikan tanpa hapus kalau lagi maintenance / iklan dipause.
        </p>
      </section>

      {error && (
        <div
          className={cn(
            'rounded-lg p-3 text-sm',
            TONES.danger.bg,
            TONES.danger.text,
          )}
        >
          {error}
        </div>
      )}

      <div className="border-warm-200 bg-card/80 sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border p-4 backdrop-blur">
        {savedAt && (
          <span className={cn('text-xs', TONES.success.text)}>
            Tersimpan {savedAt}
          </span>
        )}
        <Link
          href={`/p/${lpSlug}`}
          target="_blank"
          className="text-warm-600 hover:text-warm-900 text-sm"
        >
          Preview LP →
        </Link>
        <Button onClick={handleSave} disabled={saving || !config.liveRoomId}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? 'Menyimpan…' : 'Simpan konfigurasi'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Hapus konfigurasi Live AI Embed dari LP ini?"
        description="Widget live tidak akan muncul lagi di halaman publik LP."
        isLoading={deleting}
        onConfirm={handleDelete}
      />
    </PageContainer>
  )
}
