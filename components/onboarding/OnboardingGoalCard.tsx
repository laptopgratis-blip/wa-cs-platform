'use client'

// Card kecil untuk tampilkan goal onboarding user saat ini + tombol
// "Ubah tujuan". Dipakai di /billing. Reset goal via POST endpoint, lalu
// redirect ke /onboarding untuk pilih ulang.
import {
  Bot,
  Compass,
  GraduationCap,
  MessageCircle,
  RotateCcw,
  ShoppingCart,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Goal = 'CS_AI' | 'SELL_LP' | 'SELL_WA' | 'LMS'

const GOAL_LABEL: Record<
  Goal,
  { icon: LucideIcon; title: string; sub: string }
> = {
  CS_AI: {
    icon: Bot,
    title: 'CS WhatsApp otomatis 24 jam',
    sub: 'Fokus AI menjawab pelanggan tanpa lelah.',
  },
  SELL_LP: {
    icon: ShoppingCart,
    title: 'Jualan produk fisik dengan Landing Page',
    sub: 'LP + form order + ongkir + follow-up otomatis.',
  },
  SELL_WA: {
    icon: MessageCircle,
    title: 'Jualan langsung di WhatsApp',
    sub: 'AI tanya kebutuhan, kasih harga, langsung order.',
  },
  LMS: {
    icon: GraduationCap,
    title: 'Jualan course / produk digital',
    sub: 'Bikin kelas online, akses otomatis ke pelanggan setelah bayar.',
  },
}

interface Props {
  /** Goal user saat ini. Null = belum pernah pilih (atau sudah skip permanen). */
  currentGoal: Goal | null
}

export function OnboardingGoalCard({ currentGoal }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleReset() {
    if (
      !confirm(
        currentGoal
          ? 'Yakin mau ganti tujuan? Setelah ini kamu akan diarahkan ke wizard untuk pilih ulang.'
          : 'Buka wizard onboarding untuk pilih tujuan?',
      )
    )
      return

    setBusy(true)
    try {
      const res = await fetch('/api/onboarding/reset-goal', { method: 'POST' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Gagal reset')
      }
      router.push('/onboarding')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal reset'
      toast.error(msg)
      setBusy(false)
    }
  }

  const info = currentGoal ? GOAL_LABEL[currentGoal] : null

  return (
    <Card className="border-warm-200 rounded-xl shadow-sm">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-5">
        <div className="bg-primary-100 text-primary-700 flex size-12 shrink-0 items-center justify-center rounded-xl">
          {info ? (
            <info.icon className="size-6" aria-hidden />
          ) : (
            <Compass className="size-6" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-warm-500 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <Target className="size-3.5" /> Tujuan Pakai Hulao
          </div>
          {info ? (
            <>
              <p className="font-display text-warm-900 mt-1 text-base font-bold">
                {info.title}
              </p>
              <p className="text-warm-600 text-sm">{info.sub}</p>
            </>
          ) : (
            <>
              <p className="font-display text-warm-900 mt-1 text-base font-bold">
                Belum dipilih
              </p>
              <p className="text-warm-600 text-sm">
                Bantu kami menyesuaikan tampilan & panduan dengan tujuanmu.
              </p>
            </>
          )}
        </div>

        <Button
          variant={currentGoal ? 'outline' : 'default'}
          size="sm"
          onClick={handleReset}
          disabled={busy}
          className="shrink-0"
        >
          <RotateCcw className="mr-1.5 size-3.5" />
          {currentGoal ? 'Ubah Tujuan' : 'Pilih Tujuan'}
        </Button>
      </CardContent>
    </Card>
  )
}
