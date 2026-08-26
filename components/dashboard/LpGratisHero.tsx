// LpGratisHero — card prominent di dashboard yang mengarahkan user ke
// /onboarding/lp-gratis. Wizard utama untuk user yang mau bikin LP gratis
// tanpa harus commit ke goal SELL_LP / upgrade plan.

import { ArrowRight, Rocket, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function LpGratisHero() {
  return (
    <Card className="border-primary-300 from-primary-500 via-primary-500 to-primary-400 relative overflow-hidden rounded-2xl border-2 bg-linear-to-br">
      {/* Decorative blobs */}
      <div
        aria-hidden
        className="absolute -top-20 -right-20 size-56 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="bg-primary-200/20 absolute -bottom-16 -left-16 size-48 rounded-full blur-3xl"
      />

      <div className="relative flex flex-col gap-5 p-6 md:flex-row md:items-center md:gap-8 md:p-8">
        <div className="text-warm-900 flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-lg backdrop-blur-sm md:size-20">
          <Rocket className="size-9 md:size-11" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-warm-900 mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold tracking-wider uppercase backdrop-blur-sm">
            <Sparkles className="size-3" /> Wizard Utama · Gratis
          </div>
          <h2 className="text-warm-900 font-display text-2xl leading-tight font-semibold md:text-3xl">
            Bikin Landing Page Gratis
          </h2>
          <p className="text-warm-900/90 mt-1 text-sm md:text-base">
            5 menit selesai. Upload foto, copy prompt → AI bikin HTML, paste,
            edit visual, publish. <strong>Tanpa upgrade plan</strong>.
          </p>

          <ul className="text-warm-900/95 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm">
            <li className="flex items-center gap-1">
              <span className="text-warm-900/70">①</span> Siapkan foto
            </li>
            <li className="flex items-center gap-1">
              <span className="text-warm-900/70">②</span> Upload
            </li>
            <li className="flex items-center gap-1">
              <span className="text-warm-900/70">③</span> Copy ke
              ChatGPT/Claude.ai
            </li>
            <li className="flex items-center gap-1">
              <span className="text-warm-900/70">④</span> Paste & publish
            </li>
          </ul>
        </div>

        <Button
          asChild
          size="lg"
          className="text-primary-700 hover:bg-warm-50 hover:text-primary-800 shrink-0 bg-white px-6 py-6 text-base font-bold shadow-lg"
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
