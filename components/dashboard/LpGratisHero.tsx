// LpGratisHero — card prominent di dashboard yang mengarahkan user ke
// /onboarding/lp-gratis. Wizard utama untuk user yang mau bikin LP gratis
// tanpa harus commit ke goal SELL_LP / upgrade plan.

import { ArrowRight, Rocket, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function LpGratisHero() {
  return (
    <Card className="relative overflow-hidden rounded-2xl border-2 border-primary-300 bg-gradient-to-br from-primary-500 via-orange-500 to-amber-500 shadow-xl">
      {/* Decorative blobs */}
      <div
        aria-hidden
        className="absolute -right-20 -top-20 size-56 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-16 -left-16 size-48 rounded-full bg-amber-200/20 blur-3xl"
      />

      <div className="relative flex flex-col gap-5 p-6 md:flex-row md:items-center md:gap-8 md:p-8">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white shadow-lg backdrop-blur-sm md:size-20">
          <Rocket className="size-9 md:size-11" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
            <Sparkles className="size-3" /> Wizard Utama · Gratis
          </div>
          <h2 className="font-display text-2xl font-extrabold leading-tight text-white drop-shadow md:text-3xl">
            Bikin Landing Page Gratis
          </h2>
          <p className="mt-1 text-sm text-white/90 md:text-base">
            5 menit selesai. Upload foto, copy prompt → AI bikin HTML, paste,
            edit visual, publish. <strong>Tanpa upgrade plan</strong>.
          </p>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/95 md:text-sm">
            <li className="flex items-center gap-1">
              <span className="text-white/70">①</span> Siapkan foto
            </li>
            <li className="flex items-center gap-1">
              <span className="text-white/70">②</span> Upload
            </li>
            <li className="flex items-center gap-1">
              <span className="text-white/70">③</span> Copy ke ChatGPT/Claude.ai
            </li>
            <li className="flex items-center gap-1">
              <span className="text-white/70">④</span> Paste & publish
            </li>
          </ul>
        </div>

        <Button
          asChild
          size="lg"
          className="shrink-0 bg-white px-6 py-6 text-base font-bold text-primary-700 shadow-lg hover:bg-warm-50 hover:text-primary-800"
        >
          <Link href="/onboarding/lp-gratis">
            Mulai sekarang
            <ArrowRight className="ml-1.5 size-5" />
          </Link>
        </Button>
      </div>
    </Card>
  )
}
