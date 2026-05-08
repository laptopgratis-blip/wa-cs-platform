// Lead magnet: bonus LP builder gratis pakai AI. Hook akuisisi terkuat
// karena offer-nya konkret (gratis selamanya 1 LP) dan terhubung ke value
// utama (LP customer langsung connect ke WA AI).
import { ArrowRight, Sparkles, Wand2, Zap } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

const perks = [
  '1 landing page profesional',
  '1.000 pengunjung/bulan',
  'AI generate dari deskripsi produk',
  'Connect ke WA bot dengan 1 klik',
]

export function LpBuilderHook() {
  return (
    <section className="container mx-auto px-4 py-16 md:py-20">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-primary-200 bg-gradient-to-br from-primary-50 via-white to-orange-50 p-8 md:p-12">
        {/* Glow ornament — orange blob */}
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-72 rounded-full bg-primary-200 opacity-30 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-24 size-72 rounded-full bg-orange-200 opacity-30 blur-3xl"
        />

        <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-300 bg-card/80 px-3 py-1.5 text-xs font-semibold text-primary-700 backdrop-blur">
              <Sparkles className="size-3" />
              Bonus untuk semua user
            </span>
            <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight text-warm-900 md:text-4xl">
              Belum punya landing page?{' '}
              <span className="text-primary-600">AI bikinin gratis.</span>
            </h2>
            <p className="mt-4 text-warm-700 md:text-lg">
              Tulis deskripsi produk dalam 1 paragraf. AI Hulao bikin landing
              page profesional dalam 30 detik. Tinggal pasang, langsung jualan.
            </p>

            <ul className="mt-6 space-y-2.5">
              {perks.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-2.5 text-sm text-warm-800"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
                    <Zap className="size-3" strokeWidth={3} />
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-primary-500 px-8 font-semibold text-white shadow-orange hover:bg-primary-600 hover:shadow-orange-lg"
              >
                <Link href="/register">
                  Coba Bikin LP Gratis
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-warm-500">
              Bonus: tombol order di LP langsung connect ke WA AI kamu. Customer
              klik → masuk WhatsApp → dibalas AI → closing.
            </p>
          </div>

          {/* Visual mockup — input prompt → output LP */}
          <div className="relative">
            <div className="rounded-2xl border border-warm-200 bg-card p-5 shadow-lg">
              <div className="flex items-center gap-2 border-b border-warm-100 pb-3">
                <Wand2 className="size-4 text-primary-500" />
                <span className="text-xs font-medium text-warm-500">
                  Generate Landing Page
                </span>
              </div>
              <div className="mt-3 rounded-lg bg-warm-50 p-3 text-sm text-warm-700">
                &ldquo;Saya jual madu hutan asli dari Sumbawa. Dipanen langsung
                dari sarang lebah liar. Cocok untuk daya tahan tubuh.&rdquo;
              </div>
              <div className="mt-3 flex items-center justify-center text-warm-400">
                <ArrowRight className="size-5 rotate-90" />
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-warm-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
                <div className="text-xs font-semibold text-amber-700">
                  Madu Hutan Sumbawa
                </div>
                <div className="mt-1 font-display text-base font-bold text-warm-900">
                  Daya Tahan Tubuh dari Sarang Lebah Liar
                </div>
                <div className="mt-2 h-1.5 w-3/4 rounded-full bg-warm-200" />
                <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-warm-200" />
                <div className="mt-3 inline-flex rounded-full bg-amber-600 px-3 py-1 text-[10px] font-bold text-white">
                  Order via WhatsApp →
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
