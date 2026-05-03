// Hero — gradient warm-50 → white, dot grid overlay, headline besar.
import { ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-warm-200">
      {/* Background: gradient diagonal warm-50 ke white */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-gradient-to-br from-primary-50 via-warm-50 to-white"
      />
      {/* Subtle dot grid pattern */}
      <div
        aria-hidden
        className="dot-grid absolute inset-0 -z-10 opacity-[0.06]"
      />

      <div className="container mx-auto px-4 py-20 md:py-28 lg:py-32">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center opacity-0 animate-fade-slide-up">
          {/* Eyebrow pill */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700">
            <Sparkles className="size-3" />
            Powered by Anthropic Claude
          </span>

          {/* Headline */}
          <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-warm-900 md:text-5xl lg:text-6xl">
            CS WhatsApp{' '}
            <span className="inline-block rounded-2xl bg-primary-100 px-3 py-0.5 text-primary-600">
              Otomatis
            </span>{' '}
            dengan AI
          </h1>

          <p className="mt-6 max-w-xl text-base text-warm-600 md:text-lg">
            <span className="font-semibold text-warm-900">Hulao</span>{' '}
            menghubungkan WhatsApp bisnis kamu dengan AI — balas pelanggan 24/7,
            kelola CRM, dan buat landing page dalam satu platform.
          </p>

          {/* CTAs */}
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-primary-500 px-8 font-semibold text-white shadow-orange hover:bg-primary-600 hover:shadow-orange-lg"
            >
              <Link href="/register">
                Mulai Gratis
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-warm-300 bg-card px-8 font-medium text-warm-700 hover:bg-warm-100 hover:text-warm-900"
            >
              <Link href="#cara-kerja">Lihat Cara Kerja</Link>
            </Button>
          </div>

          <p className="mt-5 text-xs text-warm-500">
            Tanpa kartu kredit · Token gratis untuk coba
          </p>
        </div>
      </div>
    </section>
  )
}
