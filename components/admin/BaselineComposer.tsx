'use client'

// BaselineComposer — UI editable untuk bikin baseline silent-loop video host.
//
// Tiap "baseline" = 1 motion script yang di-animate Kling (image2video) jadi
// video diam, dipakai sebagai sumber lipsync semua klip. Komponen ini:
//   - Seed draft dari 3 template (A greeting / B product / C closing) — EDITABLE.
//   - Admin bisa edit nama / kategori / motion script tiap draft.
//   - Tambah draft (dari template atau kosong) & hapus draft — berapa pun.
//   - Generate semua draft valid sekaligus (confirm dulu, ~$1.5/baseline).
//
// Quality wrapper (kamera statis, silent, loop) di-append OTOMATIS di server —
// admin cukup fokus ke motion script-nya.
//
// Dipakai 2 tempat di ClipLibraryBoard:
//   1. Setup gate (host baru belum punya baseline) — defaultSeed=true.
//   2. Panel "Tambah baseline" di board utama (collapsible) — defaultSeed=false.

import { Loader2, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface TemplateVariant {
  key: 'A' | 'B' | 'C'
  name: string
  category: string
  description: string
  motionScript: string
  alreadyExists?: boolean
  durationSec: number
  estimatedCostUsd: number
}

type DraftCategory = 'idle' | 'greeting' | 'product'
interface Draft {
  localId: number
  name: string
  category: DraftCategory
  motionScript: string
}

const CATEGORY_OPTIONS: Array<{ value: DraftCategory; label: string }> = [
  { value: 'greeting', label: 'Greeting / Sapaan' },
  { value: 'product', label: 'Product / Penjelasan' },
  { value: 'idle', label: 'Idle / Closing' },
]

const COST_PER_BASELINE_USD = 1.5
const USD_TO_IDR = 17000

// Counter modul-level supaya localId unik antar render (bukan untuk persist).
let draftSeq = 0
const nextDraftId = () => ++draftSeq

function normalizeCategory(c: string): DraftCategory {
  return c === 'idle' || c === 'product' ? c : 'greeting'
}

export function BaselineComposer({
  hostId,
  onGenerated,
  defaultSeed = true,
}: {
  hostId: string
  // Dipanggil setelah submit sukses — parent re-fetch baseline + prep status.
  onGenerated: () => void
  // true = auto-isi draft dari template saat mount (setup gate).
  // false = mulai kosong, admin tambah manual (panel "tambah baseline").
  defaultSeed?: boolean
}) {
  const [templates, setTemplates] = useState<TemplateVariant[] | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    let active = true
    void fetch(`/api/host-templates/${hostId}/baselines/variants`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { variants: TemplateVariant[] } }) => {
        if (!active) return
        const vs = j.success && j.data?.variants ? j.data.variants : []
        setTemplates(vs)
        if (defaultSeed && !seeded && vs.length > 0) {
          // Seed dari varian yang BELUM dibuat; kalau semua sudah ada, seed semua.
          const notYet = vs.filter((v) => !v.alreadyExists)
          const seedFrom = notYet.length > 0 ? notYet : vs
          setDrafts(
            seedFrom.map((v) => ({
              localId: nextDraftId(),
              name: v.name,
              category: normalizeCategory(v.category),
              motionScript: v.motionScript,
            })),
          )
          setSeeded(true)
        }
      })
      .catch(() => {
        if (active) setTemplates([])
      })
    return () => {
      active = false
    }
  }, [hostId, defaultSeed, seeded])

  function addFromTemplate(v: TemplateVariant) {
    setDrafts((d) => [
      ...d,
      {
        localId: nextDraftId(),
        name: v.name,
        category: normalizeCategory(v.category),
        motionScript: v.motionScript,
      },
    ])
  }
  function addBlank() {
    setDrafts((d) => [
      ...d,
      {
        localId: nextDraftId(),
        name: `Baseline ${d.length + 1}`,
        category: 'greeting',
        motionScript: '',
      },
    ])
  }
  function updateDraft(id: number, patch: Partial<Draft>) {
    setDrafts((d) => d.map((x) => (x.localId === id ? { ...x, ...patch } : x)))
  }
  function removeDraft(id: number) {
    setDrafts((d) => d.filter((x) => x.localId !== id))
  }

  const validDrafts = drafts.filter(
    (d) => d.name.trim().length > 0 && d.motionScript.trim().length >= 10,
  )
  const cost = validDrafts.length * COST_PER_BASELINE_USD

  async function handleGenerate() {
    if (validDrafts.length === 0) {
      toast.error('Isi minimal 1 baseline (nama + motion script ≥10 karakter)')
      return
    }
    if (
      !confirm(
        `Generate ${validDrafts.length} baseline (~$${cost.toFixed(2)} = ~Rp ${(
          cost * USD_TO_IDR
        ).toLocaleString('id-ID')})?\n\nTiap baseline butuh ~2-3 menit di Kling. Status muncul otomatis setelah jadi.`,
      )
    ) {
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/host-templates/${hostId}/baselines/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customBaselines: validDrafts.map((d) => ({
              name: d.name.trim(),
              category: d.category,
              motionScript: d.motionScript.trim(),
            })),
          }),
        },
      )
      const j = (await res.json()) as {
        success: boolean
        data?: { submitted: number; message: string }
        error?: string
      }
      if (!j.success) throw new Error(j.error ?? 'Generate gagal')
      toast.success(j.data?.message ?? `${j.data?.submitted ?? 0} baseline submitted`)
      onGenerated()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Draft cards */}
      {drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-warm-300 bg-warm-50/60 p-4 text-center">
          <p className="text-xs text-warm-600">
            Belum ada draft baseline. Tambah dari template atau buat kosong di bawah.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d, idx) => {
            const tooShort =
              d.motionScript.trim().length > 0 && d.motionScript.trim().length < 10
            return (
              <li
                key={d.localId}
                className="rounded-lg border border-warm-200 bg-white p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[160px] flex-1">
                    <label
                      htmlFor={`bl-name-${d.localId}`}
                      className="text-[10px] font-semibold uppercase tracking-wide text-warm-500"
                    >
                      Nama baseline
                    </label>
                    <Input
                      id={`bl-name-${d.localId}`}
                      value={d.name}
                      onChange={(e) => updateDraft(d.localId, { name: e.target.value })}
                      placeholder={`Baseline ${idx + 1}`}
                      maxLength={120}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`bl-cat-${d.localId}`}
                      className="text-[10px] font-semibold uppercase tracking-wide text-warm-500"
                    >
                      Kategori
                    </label>
                    <select
                      id={`bl-cat-${d.localId}`}
                      value={d.category}
                      onChange={(e) =>
                        updateDraft(d.localId, {
                          category: e.target.value as DraftCategory,
                        })
                      }
                      className="mt-1 h-9 rounded-md border border-warm-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDraft(d.localId)}
                    aria-label={`Hapus baseline ${d.name || idx + 1}`}
                    className="h-9 w-9 text-warm-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2">
                  <label
                    htmlFor={`bl-motion-${d.localId}`}
                    className="text-[10px] font-semibold uppercase tracking-wide text-warm-500"
                  >
                    Motion script (prompt gerakan — editable)
                  </label>
                  <textarea
                    id={`bl-motion-${d.localId}`}
                    value={d.motionScript}
                    onChange={(e) =>
                      updateDraft(d.localId, { motionScript: e.target.value })
                    }
                    rows={7}
                    spellCheck={false}
                    placeholder="MOTION SCRIPT — deskripsikan gerakan host detik per detik (English lebih bagus untuk Kling)…"
                    className="mt-1 w-full rounded-md border border-warm-200 bg-warm-50/40 px-3 py-2 font-mono text-[11px] leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {tooShort ? (
                    <p className="mt-1 text-[10px] text-red-600">
                      Motion script terlalu pendek (min 10 karakter).
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Add controls */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-warm-500">
          Tambah:
        </span>
        {templates === null ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-warm-500">
            <Loader2 className="h-3 w-3 animate-spin" /> template…
          </span>
        ) : (
          templates.map((v) => (
            <Button
              key={v.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addFromTemplate(v)}
              className="h-7 border-warm-300 px-2 text-[11px] text-warm-700 hover:border-orange-300 hover:bg-orange-50"
            >
              <Wand2 className="mr-1 h-3 w-3 text-orange-500" />
              {v.name.replace(/^Baseline [A-C] — /, '')}
            </Button>
          ))
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addBlank}
          className="h-7 border-warm-300 px-2 text-[11px] text-warm-700 hover:border-orange-300 hover:bg-orange-50"
        >
          <Plus className="mr-1 h-3 w-3" /> Kosong
        </Button>
      </div>

      <p className="text-[10px] text-warm-500">
        💡 Quality wrapper (kamera statis · silent · loop mulus) otomatis ditambahkan
        ke tiap prompt saat generate — kamu cukup atur gerakannya.
      </p>

      {/* Generate bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-warm-100 pt-3">
        <div className="text-[11px] text-warm-600">
          <strong className="tabular-nums">{validDrafts.length}</strong> baseline siap
          · est. cost{' '}
          <strong className="tabular-nums">${cost.toFixed(2)}</strong>{' '}
          <span className="text-warm-400">
            (~Rp {(cost * USD_TO_IDR).toLocaleString('id-ID')})
          </span>
        </div>
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={submitting || validDrafts.length === 0}
          className="bg-orange-600 hover:bg-orange-700"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-4 w-4" /> Generate {validDrafts.length}{' '}
              baseline
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
