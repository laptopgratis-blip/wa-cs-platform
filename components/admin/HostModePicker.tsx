'use client'

// Modal "Pilih jenis host" — muncul saat klik "Bikin Host Baru".
// User pilih TTS Host (existing wizard) atau Klip Live (new wizard).
//
// UX rationale:
// - Dipisah upfront jadi flow per mode jelas, gak nyampur di 1 wizard.
// - Card-style besar (touch-friendly) + icon badge biar contrast jelas.
// - Cost estimate inline jadi owner aware sebelum commit.
// - "Coming Soon" badge buat Klip Live (Sprint 2 baru aktif full pipeline).

import { Bot, Check, Lightbulb, Sparkles, Mic, Lock, Minus } from 'lucide-react'

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
            className="group border-warm-200 bg-card hover:border-primary-400 focus-visible:ring-primary-400 flex flex-col rounded-xl border-2 p-5 text-left transition hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="bg-warm-100 flex size-12 items-center justify-center rounded-xl">
                <Bot className="text-warm-600 size-6" aria-hidden />
              </div>
              <span className="bg-warm-100 text-warm-700 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase">
                Existing
              </span>
            </div>
            <h3 className="text-lg font-semibold">TTS Host</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              AI jawab semua pertanyaan customer, suara dihasilkan real-time
              dari TTS.
            </p>
            <ul className="text-warm-700 mt-3 space-y-1 text-xs">
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
            <div className="border-warm-100 mt-4 border-t pt-3">
              <div className="text-warm-500 text-xs font-semibold tracking-wider uppercase">
                Estimasi cost setup
              </div>
              <div className="text-primary-600 mt-0.5 text-sm font-semibold">
                ~10 token (1 video loop)
              </div>
            </div>
            <div className="text-primary-600 mt-3 flex items-center gap-1.5 text-xs font-semibold group-hover:underline">
              Pilih TTS Host →
            </div>
          </button>

          {/* Klip Live card */}
          <button
            type="button"
            onClick={() => !klipLiveDisabled && onSelect('NATIVE_LIBRARY')}
            disabled={klipLiveDisabled}
            className={`group focus-visible:ring-primary-400 flex flex-col rounded-xl border-2 p-5 text-left transition focus-visible:ring-2 focus-visible:outline-none ${
              klipLiveDisabled
                ? 'border-warm-100 bg-warm-50/50 cursor-not-allowed opacity-70'
                : 'border-primary-300 from-primary-50 to-primary-100 hover:border-primary-500 bg-linear-to-br hover:shadow-lg'
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="bg-primary-100 flex size-12 items-center justify-center rounded-xl">
                <Mic className="text-primary-600 size-6" aria-hidden />
              </div>
              {klipLiveDisabled ? (
                <span className="bg-warm-200 text-warm-700 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase">
                  <Lock className="size-2.5" /> Soon
                </span>
              ) : (
                <span className="from-primary-500 to-primary-600 text-warm-900 inline-flex items-center gap-1 rounded-full bg-linear-to-r px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase shadow">
                  <Sparkles className="size-2.5" /> Baru
                </span>
              )}
            </div>
            <h3 className="flex items-center gap-1 text-lg font-semibold">
              Klip Live
              <Sparkles className="text-primary-600 size-3.5" aria-hidden />
            </h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Library klip pre-baked dengan suara natural. AI match pertanyaan
              customer ke klip yang cocok. Latency rendah, lip-sync presisi.
            </p>
            <ul className="text-warm-700 mt-3 space-y-1 text-xs">
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
                  <Mic className="text-primary-500 size-3" />
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
            <div className="border-primary-200/60 mt-4 border-t pt-3">
              <div className="text-warm-500 text-xs font-semibold tracking-wider uppercase">
                Estimasi cost setup
              </div>
              <div className="text-primary-600 mt-0.5 text-sm font-semibold">
                ~50-100 token (~8-10 klip)
              </div>
            </div>
            <div
              className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${
                klipLiveDisabled
                  ? 'text-warm-400'
                  : 'text-primary-600 group-hover:underline'
              }`}
            >
              {klipLiveDisabled
                ? 'Akan tersedia Sprint 2'
                : 'Pilih Klip Live →'}
            </div>
          </button>
        </div>

        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs">
          <Lightbulb className="size-3.5 shrink-0" aria-hidden />
          <span>
            Bisa upgrade dari TTS Host → Klip Live nanti (re-use persona +
            background).
          </span>
        </p>
      </DialogContent>
    </Dialog>
  )
}
