'use client'

// Modal "Pilih jenis host" — muncul saat klik "Bikin Host Baru".
// User pilih TTS Host (existing wizard) atau Klip Live (new wizard).
//
// UX rationale:
// - Dipisah upfront jadi flow per mode jelas, gak nyampur di 1 wizard.
// - Card-style besar (touch-friendly) + emoji badge biar contrast jelas.
// - Cost estimate inline jadi owner aware sebelum commit.
// - "Coming Soon" badge buat Klip Live (Sprint 2 baru aktif full pipeline).

import { Sparkles, Mic, Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'

export type HostMode = 'TTS_GENERATIVE' | 'NATIVE_LIBRARY'

interface Props {
  onSelect: (mode: HostMode) => void
  onClose: () => void
  // Saat Klip Live belum production-ready, pass true untuk disable card-nya
  // (Sprint 1 = scaffold, Sprint 2+ baru aktif).
  klipLiveDisabled?: boolean
}

export function HostModePicker({ onSelect, onClose, klipLiveDisabled }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-background p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id="mode-picker-title"
              className="text-xl font-semibold"
            >
              Pilih jenis host
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cara host bicara di live menentukan setup & cost yang dibutuhkan.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Batal
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* TTS Host card */}
          <button
            type="button"
            onClick={() => onSelect('TTS_GENERATIVE')}
            className="group flex flex-col rounded-xl border-2 border-warm-200 bg-white p-5 text-left transition hover:border-orange-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-2xl">
                🤖
              </div>
              <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warm-700">
                Existing
              </span>
            </div>
            <h3 className="text-base font-semibold">TTS Host</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              AI jawab semua pertanyaan customer, suara dihasilkan real-time
              dari TTS.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-warm-700">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600">✓</span>
                Bisa jawab pertanyaan apa pun
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600">✓</span>
                Setup cepat — 1 video loop saja
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">~</span>
                Suara TTS realtime, sedikit delay
              </li>
            </ul>
            <div className="mt-4 border-t border-warm-100 pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-warm-500">
                Estimasi cost setup
              </div>
              <div className="mt-0.5 text-sm font-bold text-orange-600">
                ~10 token (1 video loop)
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-orange-600 group-hover:underline">
              Pilih TTS Host →
            </div>
          </button>

          {/* Klip Live card */}
          <button
            type="button"
            onClick={() => !klipLiveDisabled && onSelect('NATIVE_LIBRARY')}
            disabled={klipLiveDisabled}
            className={`group flex flex-col rounded-xl border-2 p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
              klipLiveDisabled
                ? 'cursor-not-allowed border-warm-100 bg-warm-50/50 opacity-70'
                : 'border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 hover:border-orange-500 hover:shadow-lg'
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-200 text-2xl">
                🎙️
              </div>
              {klipLiveDisabled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warm-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warm-700">
                  <Lock className="h-2.5 w-2.5" /> Soon
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                  <Sparkles className="h-2.5 w-2.5" /> Baru
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold">
              Klip Live <span className="text-xs font-normal text-orange-600">⭐</span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Library klip pre-baked dengan suara natural. AI match pertanyaan
              customer ke klip yang cocok. Latency rendah, lip-sync presisi.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-warm-700">
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600">✓</span>
                Suara natural (ElevenLabs) + lip-sync presisi
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-600">✓</span>
                <span className="inline-flex items-center gap-0.5">
                  <Mic className="h-3 w-3 text-orange-500" />
                  Visual hook + background TikTok-optimized
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-600">~</span>
                Jawaban terbatas pada library klip
              </li>
            </ul>
            <div className="mt-4 border-t border-orange-200/60 pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-warm-500">
                Estimasi cost setup
              </div>
              <div className="mt-0.5 text-sm font-bold text-orange-600">
                ~50-100 token (~8-10 klip)
              </div>
            </div>
            <div
              className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${
                klipLiveDisabled ? 'text-warm-400' : 'text-orange-600 group-hover:underline'
              }`}
            >
              {klipLiveDisabled
                ? 'Akan tersedia Sprint 2'
                : 'Pilih Klip Live →'}
            </div>
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          💡 Bisa upgrade dari TTS Host → Klip Live nanti (re-use persona +
          background).
        </p>
      </div>
    </div>
  )
}
