'use client'

// MainWelcomeWizard — modal perkenalan platform yang tampil setiap login.
// Berisi 4 slide ringan: salam, fitur utama, cara mulai, dukungan. Target
// audience = user baru yang awam teknologi, jadi bahasa simpel, banyak
// gambar/icon, tombol jelas.
//
// Behavior:
// - SessionStorage flag 'mc-welcome-shown-v1' supaya nggak nongol pas
//   navigate antar-halaman dalam satu session browser. Cleared otomatis
//   kalau user tutup tab → muncul lagi di login berikutnya.
// - Checkbox "Jangan tampilkan lagi" → POST /api/onboarding/dismiss-welcome
//   → set welcomeWizardDismissedAt di DB → permanent dismiss.
import {
  ArrowDown,
  BadgeCheck,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  Rocket,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const SESSION_FLAG = 'mc-welcome-shown-v1'

interface FeatureItem {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  accent: string
}

const FEATURES: FeatureItem[] = [
  {
    icon: Bot,
    title: 'CS WhatsApp Otomatis',
    description:
      'AI menjawab pelanggan 24 jam — tanpa lelah, tanpa libur. Kamu tinggal istirahat.',
    accent: 'bg-blue-100 text-blue-600',
  },
  {
    icon: LayoutDashboard,
    title: 'Landing Page Jualan',
    description:
      'Bikin halaman jualan profesional dalam menit. AI bantu tulis copywriting.',
    accent: 'bg-orange-100 text-orange-600',
  },
  {
    icon: BadgeCheck,
    title: 'Order & Pembayaran Otomatis',
    description:
      'Pesanan masuk → bayar → kirim invoice → cek mutasi bank, semua otomatis.',
    accent: 'bg-green-100 text-green-600',
  },
  {
    icon: GraduationCap,
    title: 'Jualan Kelas / E-book',
    description:
      'Bikin kursus online atau jual produk digital. Akses otomatis setelah pembayaran.',
    accent: 'bg-purple-100 text-purple-600',
  },
]

interface StartStep {
  number: number
  title: string
  description: string
}

const START_STEPS: StartStep[] = [
  {
    number: 1,
    title: 'Pilih tujuan kamu',
    description:
      'Mau jawab WA otomatis? Jualan dengan landing page? Bikin kelas? Pilih satu, kami siapkan panduan khusus.',
  },
  {
    number: 2,
    title: 'Hubungkan WhatsApp',
    description:
      'Scan QR sekali, WA kamu langsung terhubung. Pakai nomor pribadi atau nomor bisnis — bebas.',
  },
  {
    number: 3,
    title: 'Mulai pakai',
    description:
      'AI siap melayani pelanggan, atau kamu bisa langsung bikin landing page / produk. Semua dipandu.',
  },
]

interface Slide {
  id: 'welcome' | 'features' | 'how' | 'next'
  render: () => React.ReactNode
}

export function MainWelcomeWizard({
  initialOpen,
}: {
  initialOpen: boolean
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  // Mount: cek sessionStorage. Kalau belum pernah tampil di session ini
  // & DB belum dismiss → buka modal.
  useEffect(() => {
    if (!initialOpen) return
    if (typeof window === 'undefined') return
    const shown = window.sessionStorage.getItem(SESSION_FLAG)
    if (shown === '1') return
    setOpen(true)
  }, [initialOpen])

  // Saat dibuka, mark session sebagai shown supaya nggak nongol lagi pas
  // navigate antar halaman.
  useEffect(() => {
    if (!open) return
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(SESSION_FLAG, '1')
  }, [open])

  async function persistDismiss() {
    if (dismissing) return
    setDismissing(true)
    try {
      await fetch('/api/onboarding/dismiss-welcome', { method: 'POST' })
    } catch {
      // Silent fail — wizard tetap tertutup di session ini.
    } finally {
      setDismissing(false)
    }
  }

  async function handleClose() {
    if (dontShowAgain) {
      await persistDismiss()
    }
    setOpen(false)
  }

  const slides: Slide[] = [
    {
      id: 'welcome',
      render: () => (
        <div className="flex flex-col items-center gap-5 px-2 py-6 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-orange">
            <MessageCircle className="size-10" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 sm:text-3xl">
              Selamat datang di Hulao! 👋
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-warm-600 sm:text-base">
              Hulao adalah platform <strong>all-in-one</strong> untuk jualan
              online lewat WhatsApp. Mulai dari balas pelanggan otomatis,
              bikin landing page, sampai jualan kursus — <strong>semua di
              satu tempat</strong>.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-warm-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-warm-100 px-3 py-1">
              <CheckCircle2 className="size-3.5 text-green-600" />
              Tidak perlu ngerti coding
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-warm-100 px-3 py-1">
              <CheckCircle2 className="size-3.5 text-green-600" />
              Dipandu langkah demi langkah
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'features',
      render: () => (
        <div className="flex flex-col gap-5 px-1 py-2">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <Sparkles className="size-6" />
            </div>
            <h2 className="font-display text-xl font-extrabold text-warm-900 sm:text-2xl">
              Apa saja yang bisa kamu lakukan?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-warm-600">
              Pakai satu, atau semua sekaligus. Kamu yang pilih.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="flex items-start gap-3 rounded-xl border border-warm-200 bg-white p-3.5"
                >
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg',
                      feature.accent,
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold leading-tight text-warm-900">
                      {feature.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-warm-600">
                      {feature.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ),
    },
    {
      id: 'how',
      render: () => (
        <div className="flex flex-col gap-5 px-1 py-2">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <Rocket className="size-6" />
            </div>
            <h2 className="font-display text-xl font-extrabold text-warm-900 sm:text-2xl">
              Cara mulai cuma 3 langkah
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-warm-600">
              Kurang dari 10 menit, kamu sudah bisa terima pesanan pertama.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {START_STEPS.map((step) => (
              <div
                key={step.number}
                className="flex items-start gap-4 rounded-xl border border-warm-200 bg-white p-4"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-500 font-display text-lg font-bold text-white">
                  {step.number}
                </div>
                <div>
                  <p className="font-display text-base font-bold text-warm-900">
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-warm-600">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'next',
      render: () => (
        <div className="flex flex-col gap-5 px-1 py-2">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <Target className="size-6" />
            </div>
            <h2 className="font-display text-xl font-extrabold text-warm-900 sm:text-2xl">
              Yuk mulai sekarang!
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-warm-600">
              Tutup pop-up ini, lalu ikuti wizard yang sudah aktif di
              dashboard kamu.
            </p>
          </div>

          {/* CTA card utama — visualisasi 3 langkah konkret untuk lanjut */}
          <div className="rounded-xl border-2 border-primary-300 bg-gradient-to-br from-primary-50 via-white to-amber-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white shadow-orange">
                <Rocket className="size-5" />
              </span>
              <div className="flex-1">
                <p className="font-display text-base font-bold text-warm-900">
                  Wizard onboarding sudah siap di dashboard
                </p>
                <ol className="mt-2.5 space-y-2 text-sm text-warm-700">
                  <li className="flex items-start gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 font-display text-xs font-bold text-primary-700">
                      1
                    </span>
                    <span>
                      Scroll ke bawah dashboard (atau klik tombol di bawah)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 font-display text-xs font-bold text-primary-700">
                      2
                    </span>
                    <span>
                      Pilih tujuan kamu: jualan via WA, landing page, atau
                      kelas online
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 font-display text-xs font-bold text-primary-700">
                      3
                    </span>
                    <span>
                      Checklist langkah otomatis muncul — tinggal ikuti satu
                      per satu
                    </span>
                  </li>
                </ol>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-primary-700">
              <ArrowDown className="size-3.5 animate-bounce" />
              <span className="font-semibold">
                Wizard ada di bawah dashboard
              </span>
              <ArrowDown className="size-3.5 animate-bounce" />
            </div>
          </div>

          {/* Reassurance kecil — bukan promise yang berlebihan */}
          <p className="text-center text-xs text-warm-500">
            Tiap halaman fitur juga punya banner panduan inline supaya kamu
            tidak tersesat di tengah jalan.
          </p>
        </div>
      ),
    },
  ]

  const isLast = step === slides.length - 1
  const isFirst = step === 0

  function next() {
    if (isLast) return
    setStep((s) => s + 1)
  }

  function prev() {
    if (isFirst) return
    setStep((s) => s - 1)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) void handleClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-xl gap-0 overflow-hidden p-0"
      >
        {/* Custom close button supaya logic dismiss konsisten. */}
        <button
          type="button"
          aria-label="Tutup"
          onClick={() => void handleClose()}
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-900"
        >
          <X className="size-4" />
        </button>

        {/* DialogTitle wajib untuk a11y — sembunyikan visual karena setiap
            slide punya heading sendiri. */}
        <DialogTitle className="sr-only">
          Selamat datang di Hulao
        </DialogTitle>

        <div className="bg-gradient-to-br from-primary-50 via-white to-warm-50 px-6 pb-2 pt-7 sm:px-8">
          {slides[step].render()}
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 px-6 pb-3 pt-1">
          {slides.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step
                  ? 'w-6 bg-primary-500'
                  : 'w-1.5 bg-warm-300',
              )}
            />
          ))}
        </div>

        {/* Footer: checkbox + tombol */}
        <div className="flex flex-col gap-3 border-t border-warm-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-warm-600 sm:text-sm">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(v === true)}
            />
            <span>Jangan tampilkan lagi</span>
          </label>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={prev}
                className="gap-1"
              >
                <ChevronLeft className="size-4" />
                Kembali
              </Button>
            )}
            {!isLast ? (
              <Button
                type="button"
                size="sm"
                onClick={next}
                className="gap-1"
              >
                Lanjut
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleClose()}
                className="gap-1"
                disabled={dismissing}
              >
                Mulai pakai sekarang
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
