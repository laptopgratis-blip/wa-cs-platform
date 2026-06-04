'use client'

// Picker untuk Klip Live wizard — pilih Visual Hook + Background dari preset library.
//
// Layout:
//   Section A: Visual Hook — filter by kategori, grid card preset
//   Section B: Background — filter by kategori, grid card preset
//
// Dipakai dari OrchestratedHostWizard step 1 ketika mode=NATIVE_LIBRARY.
// Owner pilih → preset ID di-pass ke orchestrate API → server inject promptFragment.

import { Check, Sparkles, Image as ImageIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

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

  useEffect(() => {
    void fetch('/api/host-presets')
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { hooks: VisualHook[]; backgrounds: Background[] } }) => {
        if (j.success && j.data) {
          setHooks(j.data.hooks)
          setBackgrounds(j.data.backgrounds)
        }
      })
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
              <Sparkles className="h-4 w-4 text-orange-500" />
              Visual Hook — daya tarik visual host
            </div>
            <p className="text-[10px] text-muted-foreground">
              Kostum/aksesoris/prop yang bikin host eye-catching di scroll. Pilih 1
              atau skip (no hook).
            </p>
          </div>
          {selection.visualHookId ? (
            <button
              type="button"
              onClick={() => onChange({ ...selection, visualHookId: null })}
              className="text-[10px] font-semibold text-warm-600 hover:underline"
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
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                hookFilter === c.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {hooks === null ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-warm-200 bg-warm-50/50 p-2 sm:grid-cols-4 md:grid-cols-5">
            {/* Card "Tidak ada hook" */}
            <button
              type="button"
              onClick={() => onChange({ ...selection, visualHookId: null })}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border-2 p-2 text-center transition ${
                !selection.visualHookId
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-warm-200 bg-white hover:border-orange-300'
              }`}
            >
              {!selection.visualHookId ? (
                <Check className="absolute right-1 top-1 h-3 w-3 text-orange-600" />
              ) : null}
              <div className="text-lg">🚫</div>
              <div className="mt-1 text-[10px] font-semibold leading-tight">Tanpa Hook</div>
              <div className="text-[8px] text-warm-500">host clean</div>
            </button>

            {filteredHooks.map((h) => {
              const active = selection.visualHookId === h.id
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onChange({ ...selection, visualHookId: h.id })}
                  title={h.description}
                  className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border-2 p-2 text-center transition ${
                    active
                      ? 'border-orange-500 bg-orange-50 shadow-md'
                      : 'border-warm-200 bg-white hover:border-orange-300'
                  }`}
                >
                  {active ? (
                    <Check className="absolute right-1 top-1 h-3 w-3 text-orange-600" />
                  ) : null}
                  {h.cautionFlags.includes('seasonal-only') ? (
                    <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 py-px text-[8px] font-bold text-white">
                      SEASONAL
                    </span>
                  ) : null}
                  <ImageIcon className="h-5 w-5 text-warm-400" />
                  <div className="mt-1 line-clamp-2 text-[9px] font-semibold leading-tight">
                    {h.nameId}
                  </div>
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
              <ImageIcon className="h-4 w-4 text-sky-500" />
              Background Scene
            </div>
            <p className="text-[10px] text-muted-foreground">
              Suasana di belakang host. Trust/scale untuk gudang vibe, Premium untuk
              skincare, dll. Riset TikTok ID conversion patterns.
            </p>
          </div>
          {selection.backgroundId ? (
            <button
              type="button"
              onClick={() => onChange({ ...selection, backgroundId: null })}
              className="text-[10px] font-semibold text-warm-600 hover:underline"
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
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                bgFilter === c.value
                  ? 'bg-sky-500 text-white'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {backgrounds === null ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-warm-200 bg-warm-50/50 p-2 sm:grid-cols-3 md:grid-cols-4">
            {filteredBgs.map((b) => {
              const active = selection.backgroundId === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onChange({ ...selection, backgroundId: b.id })}
                  title={b.description}
                  className={`relative flex aspect-[4/3] flex-col items-stretch overflow-hidden rounded-lg border-2 p-2 text-left transition ${
                    active
                      ? 'border-sky-500 bg-sky-50 shadow-md'
                      : 'border-warm-200 bg-white hover:border-sky-300'
                  }`}
                >
                  {active ? (
                    <Check className="absolute right-1 top-1 h-3 w-3 text-sky-600" />
                  ) : null}
                  <div className="flex flex-1 items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-warm-400" />
                  </div>
                  <div className="line-clamp-1 text-[10px] font-semibold">{b.nameId}</div>
                  <div className="line-clamp-1 text-[8px] text-warm-500">
                    {b.vibeTags.slice(0, 2).join(' · ')}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Summary kalau ada pilihan */}
      {(selection.visualHookId || selection.backgroundId) && hooks && backgrounds ? (
        <div className="rounded-lg bg-gradient-to-r from-orange-50 to-sky-50 p-3 text-xs">
          <div className="font-semibold">Pilihan Klip Live:</div>
          <div className="mt-1 space-y-0.5">
            <div>
              🎭 Hook:{' '}
              <span className="font-medium">
                {hooks.find((h) => h.id === selection.visualHookId)?.nameId ?? 'Tanpa Hook'}
              </span>
            </div>
            <div>
              🎬 Background:{' '}
              <span className="font-medium">
                {backgrounds.find((b) => b.id === selection.backgroundId)?.nameId ?? '(belum dipilih)'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
