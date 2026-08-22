'use client'

// Modal "Pilih jenis host" — muncul saat klik "Bikin Host Baru".
// User pilih TTS Host (existing wizard) atau Klip Live (new wizard).
//
// UX rationale:
// - Dipisah upfront jadi flow per mode jelas, gak nyampur di 1 wizard.
// - Card-style besar (touch-friendly) + icon badge biar contrast jelas.
// - Cost estimate inline jadi owner aware sebelum commit.
// - "Coming Soon" badge buat Klip Live (Sprint 2 baru aktif full pipeline).

import { Bot, Check, Sparkles, Mic, Lock, Minus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
      >
        <div className="flex items-start justify-between gap-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Pilih jenis host
            </DialogTitle>
            <DialogDescription>
              Cara host bicara di live menentukan setup & cost yang dibutuhkan.
            </DialogDescription>
          </DialogHeader>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Batal
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* TTS Host card */}
          <button
            type="button"
            onClick={() => onSelect('TTS_GENERATIVE')}
            className="group flex flex-col rounded-xl border-2 border-warm-200 bg-card p-5 text-left transition hover:border-primary-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex size-12 items-center justify-center rounded-xl bg-warm-100">
                <Bot className="size-6 text-warm-600" aria-hidden />
              </div>
              <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-warm-700">
                Existing
              </span>
            </div>
            <h3 className="text-lg font-semibold">TTS Host</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              AI jawab semua pertanyaan customer, suara dihasilkan real-time
              dari TTS.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-warm-700">
              <li className="flex items-start gap-1.5">
                <Check
                  className={cn('mt-0.5 size-3 shrink-0', TONES.success.text)}
                  aria-hidden
                />
                Bisa jawab pertanyaan apa pun
              </li>
              <li className="flex items-start gap-1.5">
                <Check
                  className={cn('mt-0.5 size-3 shrink-0', TONES.success.text)}
                  aria-hidden
                />
                Setup cepat — 1 video loop saja
              </li>
              <li className="flex items-start gap-1.5">
                <Minus
                  className={cn('mt-0.5 size-3 shrink-0', TONES.warning.text)}
                  aria-hidden
                />
                Suara TTS realtime, sedikit delay
              </li>
            </ul>
            <div className="mt-4 border-t border-warm-100 pt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-warm-500">
                Estimasi cost setup
              </div>
              <div className="mt-0.5 text-sm font-semibold text-primary-600">
                ~10 token (1 video loop)
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary-600 group-hover:underline">
              Pilih TTS Host →
            </div>
          </button>

          {/* Klip Live card */}
          <button
            type="button"
            onClick={() => !klipLiveDisabled && onSelect('NATIVE_LIBRARY')}
            disabled={klipLiveDisabled}
            className={`group flex flex-col rounded-xl border-2 p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
              klipLiveDisabled
                ? 'cursor-not-allowed border-warm-100 bg-warm-50/50 opacity-70'
                : 'border-primary-300 bg-linear-to-br from-primary-50 to-primary-100 hover:border-primary-500 hover:shadow-lg'
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary-100">
                <Mic className="size-6 text-primary-600" aria-hidden />
              </div>
              {klipLiveDisabled ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warm-200 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-warm-700">
                  <Lock className="size-2.5" /> Soon
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-linear-to-r from-primary-500 to-primary-600 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-white shadow">
                  <Sparkles className="size-2.5" /> Baru
                </span>
              )}
            </div>
            <h3 className="flex items-center gap-1 text-lg font-semibold">
              Klip Live
              <Sparkles className="size-3.5 text-primary-600" aria-hidden />
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Library klip pre-baked dengan suara natural. AI match pertanyaan
              customer ke klip yang cocok. Latency rendah, lip-sync presisi.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-warm-700">
              <li className="flex items-start gap-1.5">
                <Check
                  className={cn('mt-0.5 size-3 shrink-0', TONES.success.text)}
                  aria-hidden
                />
                Suara natural (ElevenLabs) + lip-sync presisi
              </li>
              <li className="flex items-start gap-1.5">
                <Check
                  className={cn('mt-0.5 size-3 shrink-0', TONES.success.text)}
                  aria-hidden
                />
                <span className="inline-flex items-center gap-0.5">
                  <Mic className="size-3 text-primary-500" />
                  Visual hook + background TikTok-optimized
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <Minus
                  className={cn('mt-0.5 size-3 shrink-0', TONES.warning.text)}
                  aria-hidden
                />
                Jawaban terbatas pada library klip
              </li>
            </ul>
            <div className="mt-4 border-t border-primary-200/60 pt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-warm-500">
                Estimasi cost setup
              </div>
              <div className="mt-0.5 text-sm font-semibold text-primary-600">
                ~50-100 token (~8-10 klip)
              </div>
            </div>
            <div
              className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${
                klipLiveDisabled ? 'text-warm-400' : 'text-primary-600 group-hover:underline'
              }`}
            >
              {klipLiveDisabled
                ? 'Akan tersedia Sprint 2'
                : 'Pilih Klip Live →'}
            </div>
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          💡 Bisa upgrade dari TTS Host → Klip Live nanti (re-use persona +
          background).
        </p>
      </DialogContent>
    </Dialog>
  )
}
