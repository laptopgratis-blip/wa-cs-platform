'use client'

// Config panel Live AI Embed di LP — owner pilih LiveRoom, atur gate, position, dll.
// Endpoint: GET/PUT/DELETE /api/lp/[lpId]/live-embed
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type GateMode = 'REQUIRED' | 'OPTIONAL' | 'HYBRID' | 'OFF'
type GateField = 'name' | 'phone' | 'email' | 'city' | 'productInterest'
type Position = 'inline' | 'floating-br' | 'floating-bl' | 'floating-tr' | 'floating-tl'

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
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
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
    if (!confirm('Hapus konfigurasi Live AI Embed dari LP ini? Widget tidak akan muncul lagi.')) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/lp/${lpId}/live-embed`, { method: 'DELETE' })
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
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/landing-pages/${lpId}/edit`}
            className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-700"
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Kembali ke editor LP
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Live AI Embed</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Hubungkan LP <strong>{lpTitle}</strong> dengan satu Live Room. Widget muncul
            otomatis di <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">/p/{lpSlug}</code>.
          </p>
        </div>
        {hasConfig && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="mr-1 h-4 w-4" /> {deleting ? 'Menghapus…' : 'Hapus'}
          </button>
        )}
      </div>

      {rooms.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Belum ada Live Room. Bikin dulu di{' '}
          <Link href="/live-rooms/new" className="font-medium underline">
            /live-rooms/new
          </Link>{' '}
          sebelum embed di LP.
        </div>
      )}

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-medium">1. Pilih Live Room</h2>
        <div className="grid gap-2">
          {rooms.map((r) => (
            <label
              key={r.id}
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition ${
                config.liveRoomId === r.id
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <div className="flex items-center">
                <input
                  type="radio"
                  name="liveRoomId"
                  checked={config.liveRoomId === r.id}
                  onChange={() => setConfig((p) => ({ ...p, liveRoomId: r.id }))}
                  className="mr-3"
                />
                <div>
                  <div className="font-medium text-zinc-900">{r.name}</div>
                  <div className="text-xs text-zinc-500">
                    /live/{r.slug} · {r.hostTemplate.mode === 'NATIVE_LIBRARY' ? 'Klip Live' : 'TTS'}
                    {!r.isActive && ' · ⚠️ tidak aktif'}
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-medium">2. Mode Gate (wajib isi nama+WA)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { v: 'REQUIRED', label: 'Wajib', desc: 'Form blocking — harus isi dulu baru nonton' },
              { v: 'OPTIONAL', label: 'Opsional', desc: 'Form muncul tapi ada tombol "lewati"' },
              { v: 'HYBRID', label: 'Hybrid (rekomendasi)', desc: 'Auto-play; gate trigger di detik N atau klik chat' },
              { v: 'OFF', label: 'Mati', desc: 'Tidak ada gate, pure tontonan (cocok SEO/showcase)' },
            ] as const
          ).map((opt) => (
            <label
              key={opt.v}
              className={`flex cursor-pointer rounded-lg border p-3 transition ${
                config.gateMode === opt.v
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <input
                type="radio"
                name="gateMode"
                checked={config.gateMode === opt.v}
                onChange={() => setConfig((p) => ({ ...p, gateMode: opt.v }))}
                className="mr-3 mt-1"
              />
              <div>
                <div className="font-medium text-zinc-900">{opt.label}</div>
                <div className="text-xs text-zinc-500">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {config.gateMode === 'HYBRID' && (
          <div className="space-y-3 rounded-lg bg-zinc-50 p-4">
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Gate trigger setelah (detik)</span>
              <input
                type="number"
                min={0}
                max={600}
                value={config.gateTriggerSec}
                onChange={(e) => setConfig((p) => ({ ...p, gateTriggerSec: parseInt(e.target.value) || 0 }))}
                className="mt-1 w-32 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
              />
              <span className="ml-2 text-xs text-zinc-500">0 = tidak pakai timer, tunggu klik chat</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.gateTriggerOnChat}
                onChange={(e) => setConfig((p) => ({ ...p, gateTriggerOnChat: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-xs text-zinc-700">Trigger juga saat viewer klik area chat</span>
            </label>
          </div>
        )}

        {config.gateMode !== 'OFF' && (
          <div>
            <div className="text-xs font-medium text-zinc-700">Field yang dikumpulkan:</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['name', 'phone', 'email', 'city', 'productInterest'] as const).map((f) => (
                <label
                  key={f}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                    config.gateFields.includes(f)
                      ? 'border-orange-500 bg-orange-100 text-orange-700'
                      : 'border-zinc-300 text-zinc-600'
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

      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-medium">3. Posisi & tampilan</h2>
        <div>
          <span className="text-xs font-medium text-zinc-700">Posisi widget:</span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(['inline', 'floating-br', 'floating-bl', 'floating-tr', 'floating-tl'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, position: p }))}
                className={`rounded-lg border p-2 text-xs ${
                  config.position === p
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-zinc-200 text-zinc-600'
                }`}
              >
                {p === 'inline' ? '📐 Inline' : `🪟 ${p.replace('floating-', '').toUpperCase()}`}
              </button>
            ))}
          </div>
          {config.position === 'inline' && (
            <p className="mt-2 text-xs text-zinc-500">
              Owner paste <code className="rounded bg-zinc-100 px-1.5 py-0.5">{`<div data-hulao-live-embed></div>`}</code> di HTML LP
              untuk pilih posisi. Tanpa marker, widget muncul di akhir halaman.
            </p>
          )}
        </div>

        {config.position === 'inline' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Width (px)</span>
              <input
                type="number"
                min={280}
                max={1200}
                value={config.widthPx}
                onChange={(e) => setConfig((p) => ({ ...p, widthPx: parseInt(e.target.value) || 420 }))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Height (px)</span>
              <input
                type="number"
                min={400}
                max={1600}
                value={config.heightPx}
                onChange={(e) => setConfig((p) => ({ ...p, heightPx: parseInt(e.target.value) || 720 }))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
              />
            </label>
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-zinc-700">CTA label (untuk tombol floating)</span>
          <input
            type="text"
            value={config.ctaLabel}
            onChange={(e) => setConfig((p) => ({ ...p, ctaLabel: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </label>

        <label className="flex items-center">
          <input
            type="checkbox"
            checked={config.autoplay}
            onChange={(e) => setConfig((p) => ({ ...p, autoplay: e.target.checked }))}
            className="mr-2"
          />
          <span className="text-xs text-zinc-700">Auto-play saat halaman load</span>
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={config.mutedDefault}
            onChange={(e) => setConfig((p) => ({ ...p, mutedDefault: e.target.checked }))}
            className="mr-2"
          />
          <span className="text-xs text-zinc-700">Mute by default (rekomendasi — Chrome block autoplay+audio)</span>
        </label>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={config.isActive}
            onChange={(e) => setConfig((p) => ({ ...p, isActive: e.target.checked }))}
            className="mr-2"
          />
          <span className="text-sm font-medium text-zinc-900">Aktifkan embed</span>
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          Matikan tanpa hapus kalau lagi maintenance / iklan dipause.
        </p>
      </section>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-zinc-200 bg-white/80 p-4 backdrop-blur">
        {savedAt && <span className="text-xs text-green-600">Tersimpan {savedAt}</span>}
        <Link
          href={`/p/${lpSlug}`}
          target="_blank"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          Preview LP →
        </Link>
        <button
          onClick={handleSave}
          disabled={saving || !config.liveRoomId}
          className="inline-flex items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Menyimpan…' : 'Simpan konfigurasi'}
        </button>
      </div>
    </div>
  )
}
