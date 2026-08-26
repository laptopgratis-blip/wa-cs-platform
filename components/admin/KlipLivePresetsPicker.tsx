'use client'

// Picker untuk Klip Live wizard — pilih Visual Hook + Background dari preset library.
//
// Layout:
//   Section A: Visual Hook — filter by kategori, grid card preset
//   Section B: Background — filter by kategori, grid card preset
//
// Dipakai dari OrchestratedHostWizard step 1 ketika mode=NATIVE_LIBRARY.
// Owner pilih → preset ID di-pass ke orchestrate API → server inject promptFragment.
//
// Thumbnail: file di-generate admin via /admin/host-templates (kartu
// "Thumbnail Preset Klip Live" → /api/admin/host-presets/generate-thumbnails).
// Kartu render <img thumbnailUrl> + overlay teks; kalau file belum ada /
// gagal load (onError) → fallback ke kartu text-only (nama + vibe tag).

import {
  Ban,
  Check,
  Clapperboard,
  Drama,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { TONES } from '@/lib/ui-tones'

interface VisualHook {
  id: string
  slug: string
  category: string
  nameId: string
  description: string
  thumbnailUrl: string
  vibeTags: string[]
  cautionFlags: string[]
}

interface Background {
  id: string
  slug: string
  category: string
  nameId: string
  nameEn?: string | null
  description: string
  thumbnailUrl: string
  vibeTags: string[]
}

const HOOK_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Semua' },
  { value: 'costume', label: 'Kostum (15)' },
  { value: 'headwear', label: 'Headwear (12)' },
  { value: 'prop', label: 'Props (10)' },
  { value: 'accessory', label: 'Aksesori (8)' },
  { value: 'cosplay', label: 'Cosplay (5)' },
]

const BG_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Semua' },
  { value: 'trust-scale', label: 'Trust/Scale (5)' },
  { value: 'production', label: 'Production (5)' },
  { value: 'premium', label: 'Premium (5)' },
  { value: 'lifestyle', label: 'Lifestyle (5)' },
  { value: 'specialty', label: 'Specialty (5)' },
]

export interface KlipLivePresetSelection {
  visualHookId: string | null
  backgroundId: string | null
}

export function KlipLivePresetsPicker({
  selection,
  onChange,
}: {
  selection: KlipLivePresetSelection
  onChange: (s: KlipLivePresetSelection) => void
}) {
  const [hooks, setHooks] = useState<VisualHook[] | null>(null)
  const [backgrounds, setBackgrounds] = useState<Background[] | null>(null)
  const [hookFilter, setHookFilter] = useState('')
  const [bgFilter, setBgFilter] = useState('')
  // ID preset yang thumbnail-nya gagal load (404 dll) → fallback text-only.
  const [broken, setBroken] = useState<Set<string>>(new Set())

  const markBroken = useCallback((id: string) => {
    setBroken((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    void fetch('/api/host-presets')
      .then((r) => r.json())
      .then(
        (j: {
          success: boolean
          data?: { hooks: VisualHook[]; backgrounds: Background[] }
        }) => {
          if (j.success && j.data) {
            setHooks(j.data.hooks)
            setBackgrounds(j.data.backgrounds)
          }
        },
      )
      .catch(() => {
        setHooks([])
        setBackgrounds([])
      })
  }, [])

  const filteredHooks = (hooks ?? []).filter(
    (h) => !hookFilter || h.category === hookFilter,
  )
  const filteredBgs = (backgrounds ?? []).filter(
    (b) => !bgFilter || b.category === bgFilter,
  )

  return (
    <div className="space-y-5">
      {/* Visual Hook Picker */}
      <section>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="text-primary-500 size-4" />
              Visual Hook — daya tarik visual host
            </div>
            <p className="text-muted-foreground text-xs">
              Kostum/aksesoris/prop yang bikin host eye-catching di scroll.
              Pilih berdasarkan nama (arahkan kursor untuk deskripsi), atau skip
              (no hook).
            </p>
          </div>
          {selection.visualHookId ? (
            <button
              type="button"
              onClick={() => onChange({ ...selection, visualHookId: null })}
              className="text-warm-600 text-xs font-semibold hover:underline"
            >
              Clear pilihan
            </button>
          ) : null}
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {HOOK_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setHookFilter(c.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                hookFilter === c.value
                  ? 'bg-primary-500 text-warm-900'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {hooks === null ? (
          <div className="text-muted-foreground py-4 text-center text-xs">
            Memuat…
          </div>
        ) : (
          <div className="border-warm-200 bg-warm-50/50 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-4 md:grid-cols-5">
            {/* Card "Tidak ada hook" */}
            <button
              type="button"
              onClick={() => onChange({ ...selection, visualHookId: null })}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border-2 p-2 text-center transition ${
                !selection.visualHookId
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-warm-200 bg-card hover:border-primary-300'
              }`}
            >
              {!selection.visualHookId ? (
                <Check className="text-primary-600 absolute top-1 right-1 size-3" />
              ) : null}
              <Ban className="text-warm-400 size-5" />
              <div className="mt-1 text-xs leading-tight font-semibold">
                Tanpa Hook
              </div>
              <div className="text-warm-500 text-xs">host clean</div>
            </button>

            {filteredHooks.map((h) => {
              const active = selection.visualHookId === h.id
              const hasImg = Boolean(h.thumbnailUrl) && !broken.has(h.id)
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onChange({ ...selection, visualHookId: h.id })}
                  title={h.description}
                  className={`relative flex aspect-square flex-col justify-end gap-0.5 overflow-hidden rounded-lg border-2 p-2 text-left transition ${
                    active
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-warm-200 bg-card hover:border-primary-300'
                  }`}
                >
                  {hasImg ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- uploads di-serve nginx, optimizer off (lihat next.config) */}
                      <img
                        src={h.thumbnailUrl}
                        alt={h.nameId}
                        loading="lazy"
                        onError={() => markBroken(h.id)}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/75 via-black/25 to-transparent"
                      />
                    </>
                  ) : null}
                  {active ? (
                    <Check className="text-primary-600 absolute top-1 right-1 size-4 rounded-full bg-white/90 p-0.5" />
                  ) : null}
                  {h.cautionFlags.includes('seasonal-only') ? (
                    <span
                      className={`absolute top-1 left-1 rounded px-1 py-px text-xs font-bold ${TONES.warning.solid}`}
                    >
                      SEASONAL
                    </span>
                  ) : null}
                  <div
                    className={`relative line-clamp-3 text-xs leading-tight font-semibold ${
                      hasImg ? 'text-white drop-shadow' : 'text-warm-800'
                    }`}
                  >
                    {h.nameId}
                  </div>
                  {h.vibeTags.length > 0 ? (
                    <div
                      className={`relative line-clamp-1 text-xs ${
                        hasImg ? 'text-white/85' : 'text-warm-500'
                      }`}
                    >
                      {h.vibeTags.slice(0, 2).join(' · ')}
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Background Picker */}
      <section>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <ImageIcon className="text-primary-500 size-4" />
              Background Scene
            </div>
            <p className="text-muted-foreground text-xs">
              Suasana di belakang host. Trust/scale untuk gudang vibe, Premium
              untuk skincare, dll. Riset TikTok ID conversion patterns.
            </p>
          </div>
          {selection.backgroundId ? (
            <button
              type="button"
              onClick={() => onChange({ ...selection, backgroundId: null })}
              className="text-warm-600 text-xs font-semibold hover:underline"
            >
              Clear pilihan
            </button>
          ) : null}
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {BG_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setBgFilter(c.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                bgFilter === c.value
                  ? 'bg-primary-500 text-warm-900'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {backgrounds === null ? (
          <div className="text-muted-foreground py-4 text-center text-xs">
            Memuat…
          </div>
        ) : (
          <div className="border-warm-200 bg-warm-50/50 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3 md:grid-cols-4">
            {filteredBgs.map((b) => {
              const active = selection.backgroundId === b.id
              const hasImg = Boolean(b.thumbnailUrl) && !broken.has(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onChange({ ...selection, backgroundId: b.id })}
                  title={b.description}
                  className={`relative flex aspect-[4/3] flex-col items-stretch overflow-hidden rounded-lg border-2 p-2 text-left transition ${
                    active
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-warm-200 bg-card hover:border-primary-300'
                  }`}
                >
                  {hasImg ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- uploads di-serve nginx, optimizer off (lihat next.config) */}
                      <img
                        src={b.thumbnailUrl}
                        alt={b.nameId}
                        loading="lazy"
                        onError={() => markBroken(b.id)}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/75 via-black/25 to-transparent"
                      />
                    </>
                  ) : null}
                  {active ? (
                    <Check className="text-primary-600 absolute top-1 right-1 size-4 rounded-full bg-white/90 p-0.5" />
                  ) : null}
                  <div className="relative flex flex-1 flex-col justify-end">
                    <div
                      className={`line-clamp-2 text-xs leading-tight font-semibold ${
                        hasImg ? 'text-white drop-shadow' : 'text-warm-800'
                      }`}
                    >
                      {b.nameId}
                    </div>
                    {b.vibeTags.length > 0 ? (
                      <div
                        className={`mt-0.5 line-clamp-1 text-xs ${
                          hasImg ? 'text-white/85' : 'text-warm-500'
                        }`}
                      >
                        {b.vibeTags.slice(0, 2).join(' · ')}
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Summary kalau ada pilihan */}
      {(selection.visualHookId || selection.backgroundId) &&
      hooks &&
      backgrounds ? (
        <div className="bg-primary-50 rounded-lg p-3 text-xs">
          <div className="font-semibold">Pilihan Klip Live:</div>
          <div className="mt-1 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Drama className="text-primary-600 size-3.5" /> Hook:{' '}
              <span className="font-medium">
                {hooks.find((h) => h.id === selection.visualHookId)?.nameId ??
                  'Tanpa Hook'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clapperboard className="text-primary-600 size-3.5" /> Background:{' '}
              <span className="font-medium">
                {backgrounds.find((b) => b.id === selection.backgroundId)
                  ?.nameId ?? '(belum dipilih)'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
