'use client'

// Intent Wizard — 2 step: Q1 goal pick (4 card besar), Q2 kondisional
// (cuma kalau Q1=SELL_PRODUCT, tanya pakai LP atau langsung WA). Hasil
// disimpan via POST /api/onboarding/save-goal lalu redirect ke /dashboard.
import { ArrowLeft, ArrowRight, Bot, GraduationCap, HelpCircle, ShoppingBag } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Q1Choice = 'CS_AI' | 'SELL_PRODUCT' | 'LMS' | 'SKIP'
type Q2Choice = 'WITH_LP' | 'WA_ONLY'
type FinalGoal = 'CS_AI' | 'SELL_LP' | 'SELL_WA' | 'LMS' | null

interface OptionCard {
  id: Q1Choice
  emoji: string
  Icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  accent: string
}

const Q1_OPTIONS: OptionCard[] = [
  {
    id: 'CS_AI',
    emoji: '🤖',
    Icon: Bot,
    title: 'Mau WhatsApp dijawab otomatis 24 jam',
    description: 'Cocok untuk yang sibuk dan ingin AI menjawab pelanggan tanpa lelah.',
    accent: 'from-blue-50 to-indigo-50 border-blue-200 hover:border-blue-400',
  },
  {
    id: 'SELL_PRODUCT',
    emoji: '🛒',
    Icon: ShoppingBag,
    title: 'Mau jualan produk fisik',
    description: 'POD, dropship, atau brand sendiri. Kelola pesanan & pembayaran otomatis.',
    accent: 'from-orange-50 to-amber-50 border-orange-200 hover:border-orange-400',
  },
  {
    id: 'LMS',
    emoji: '🎓',
    Icon: GraduationCap,
    title: 'Mau jualan course / e-book / produk digital',
    description: 'Bikin kelas online, kasih akses otomatis setelah pembayaran.',
    accent: 'from-purple-50 to-fuchsia-50 border-purple-200 hover:border-purple-400',
  },
  {
    id: 'SKIP',
    emoji: '🤔',
    Icon: HelpCircle,
    title: 'Belum tahu / mau lihat-lihat dulu',
    description: 'Kamu bisa pilih tujuan nanti dari halaman pengaturan.',
    accent: 'from-warm-50 to-warm-100 border-warm-200 hover:border-warm-400',
  },
]

interface Q2Option {
  id: Q2Choice
  emoji: string
  title: string
  description: string
}

const Q2_OPTIONS: Q2Option[] = [
  {
    id: 'WITH_LP',
    emoji: '📄',
    title: 'Pakai Landing Page',
    description: 'Bikin halaman jualan dengan AI, ada form order, hitung ongkir, follow-up otomatis. Cocok untuk traffic dari iklan.',
  },
  {
    id: 'WA_ONLY',
    emoji: '💬',
    title: 'Langsung jualan di WA',
    description: 'Setup paling cepat. Pelanggan chat WA, AI tanya kebutuhan, kasih harga, langsung order.',
  },
]

export function IntentWizard() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [q2, setQ2] = useState<Q2Choice | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function pickQ1(choice: Q1Choice) {
    if (choice === 'SELL_PRODUCT') {
      // Lanjut ke Q2 untuk tanya LP atau WA only.
      setStep(2)
      return
    }
    // Goal langsung final — submit.
    void submitGoal(resolveGoal(choice, null), choice === 'SKIP')
  }

  function pickQ2(choice: Q2Choice) {
    setQ2(choice)
    void submitGoal(resolveGoal('SELL_PRODUCT', choice), false)
  }

  function resolveGoal(q1Pick: Q1Choice, q2Pick: Q2Choice | null): FinalGoal {
    if (q1Pick === 'CS_AI') return 'CS_AI'
    if (q1Pick === 'LMS') return 'LMS'
    if (q1Pick === 'SKIP') return null
    if (q1Pick === 'SELL_PRODUCT' && q2Pick === 'WITH_LP') return 'SELL_LP'
    if (q1Pick === 'SELL_PRODUCT' && q2Pick === 'WA_ONLY') return 'SELL_WA'
    return null
  }

  async function submitGoal(goal: FinalGoal, isSkip: boolean) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/onboarding/save-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, isSkip }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Gagal menyimpan')
      }
      // Goal valid → langsung ke wizard mode panduan step-by-step.
      // Skip → ke dashboard biasa.
      if (isSkip || !goal) {
        router.push('/dashboard')
      } else {
        router.push('/onboarding/guide')
      }
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan'
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 self-center text-sm text-warm-500">
        <span className={cn('flex size-7 items-center justify-center rounded-full font-semibold', step === 1 ? 'bg-primary-500 text-white' : 'bg-warm-200 text-warm-600')}>1</span>
        <span className={cn('h-px w-10', step === 2 ? 'bg-primary-500' : 'bg-warm-300')} />
        <span className={cn('flex size-7 items-center justify-center rounded-full font-semibold', step === 2 ? 'bg-primary-500 text-white' : 'bg-warm-200 text-warm-500')}>2</span>
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-6">
          <div className="text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
              Selamat datang di Hulao! 👋
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-warm-600">
              Biar setup-nya cepat & nggak ribet, kasih tahu kami tujuan utamamu pakai Hulao.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {Q1_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={submitting}
                onClick={() => pickQ1(opt.id)}
                className={cn(
                  'group flex flex-col items-start gap-3 rounded-2xl border-2 bg-gradient-to-br p-5 text-left transition-all hover:scale-[1.01] hover:shadow-md disabled:opacity-50',
                  opt.accent,
                )}
              >
                <span className="text-4xl" aria-hidden>
                  {opt.emoji}
                </span>
                <div>
                  <p className="font-display text-base font-bold leading-tight text-warm-900">
                    {opt.title}
                  </p>
                  <p className="mt-1.5 text-sm text-warm-600">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>

          <p className="text-center text-xs text-warm-500">
            Tidak yakin? Pilih &ldquo;Belum tahu&rdquo; — kamu bisa pilih tujuan kapan saja nanti.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-6">
          <button
            type="button"
            onClick={() => {
              setStep(1)
              setQ2(null)
            }}
            className="flex items-center gap-1.5 self-start text-sm text-warm-600 hover:text-warm-900"
          >
            <ArrowLeft className="size-4" /> Kembali
          </button>

          <div className="text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
              Mau pakai Landing Page atau langsung di WA?
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-warm-600">
              Tidak perlu pusing — kamu tetap bisa pakai keduanya nanti. Ini cuma pilihan untuk fokus setup pertama.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {Q2_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={submitting}
                onClick={() => pickQ2(opt.id)}
                className={cn(
                  'group flex flex-col items-start gap-3 rounded-2xl border-2 bg-gradient-to-br from-orange-50 to-amber-50 p-6 text-left transition-all hover:scale-[1.01] hover:border-orange-400 hover:shadow-md disabled:opacity-50',
                  q2 === opt.id ? 'border-primary-500 bg-primary-50' : 'border-orange-200',
                )}
              >
                <span className="text-5xl" aria-hidden>
                  {opt.emoji}
                </span>
                <p className="font-display text-lg font-bold leading-tight text-warm-900">
                  {opt.title}
                </p>
                <p className="text-sm text-warm-600">{opt.description}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 opacity-0 transition group-hover:opacity-100">
                  Pilih <ArrowRight className="size-4" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          disabled={submitting}
          onClick={() => submitGoal(null, true)}
        >
          Lewati & jelajahi sendiri
        </Button>
      </div>
    </div>
  )
}
