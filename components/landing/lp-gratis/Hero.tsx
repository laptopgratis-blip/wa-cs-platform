// Hero LP utama — fokus ke "bikin LP gratis 5 menit" sebagai entry-point
// utama UMKM. Customer-centric copy: outcome ("LP profesional siap iklan"),
// timeline ("5 menit"), price anchor ("gratis selamanya"), differentiator
// ("AI gratis + auto-host + WA connect").
//
// Layout: 2-col (desktop) — kiri copy + CTA, kanan visual mockup LP.
import { ArrowRight, Smartphone, Sparkles, Wand2, Zap } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="border-warm-200 relative overflow-hidden border-b">
      <div
        aria-hidden
        className="from-primary-50 absolute inset-0 -z-20 bg-gradient-to-br via-white to-orange-50"
      />
      <div
        aria-hidden
        className="dot-grid absolute inset-0 -z-10 opacity-[0.06]"
      />

      <div className="container mx-auto px-4 py-16 md:py-24 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Left: copy + CTA */}
          <div className="animate-fade-slide-up opacity-0">
            <span className="border-primary-200 bg-card/80 text-primary-700 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur">
              <Sparkles className="size-3" />
              Gratis selamanya · tanpa kartu kredit
            </span>

            <h1 className="font-display text-warm-900 mt-5 text-4xl leading-[1.05] font-extrabold tracking-tight md:text-5xl lg:text-[3.5rem]">
              Bikin{' '}
              <span className="bg-primary-100 text-primary-600 inline-block rounded-2xl px-3 py-0.5">
                Landing Page
              </span>{' '}
              jualan kamu dalam 5 menit.
            </h1>

            <p className="text-warm-700 mt-5 max-w-xl text-base md:text-lg">
              Pakai AI gratis (Gemini / Claude.ai), Hulao yang{' '}
              <span className="text-warm-900 font-semibold">
                host & auto-connect
              </span>{' '}
              ke WhatsApp untuk closing. Tanpa coding, tanpa langganan bulanan.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-primary-500 shadow-orange hover:bg-primary-600 hover:shadow-orange-lg h-12 rounded-full px-8 font-semibold text-white"
              >
                <Link href="/register">
                  Bikin LP Saya Sekarang
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-warm-300 bg-card text-warm-700 hover:bg-warm-100 hover:text-warm-900 h-12 rounded-full px-7 font-medium"
              >
                <Link href="#cara-kerja">Lihat cara kerjanya</Link>
              </Button>
            </div>

            {/* Trust strip */}
            <ul className="text-warm-600 mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium">
              <li className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Zap className="size-2.5" strokeWidth={3} />
                </span>
                5 menit selesai
              </li>
              <li className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Zap className="size-2.5" strokeWidth={3} />
                </span>
                1.000 visitor / bulan free
              </li>
              <li className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Zap className="size-2.5" strokeWidth={3} />
                </span>
                Custom slug hulao.id/p/produkmu
              </li>
              <li className="flex items-center gap-1.5">
                <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Zap className="size-2.5" strokeWidth={3} />
                </span>
                Editor visual, tanpa coding
              </li>
            </ul>
          </div>

          {/* Right: LP preview mockup */}
          <div className="animate-fade-slide-up stagger-2 opacity-0">
            <div className="relative mx-auto max-w-md">
              {/* Phone frame */}
              <div className="border-warm-900 bg-warm-900 relative rounded-[2.5rem] border-8 shadow-2xl">
                <div className="overflow-hidden rounded-[1.75rem] bg-white">
                  {/* Browser bar */}
                  <div className="border-warm-200 bg-warm-50 flex items-center gap-1.5 border-b px-3 py-2">
                    <span className="size-2 rounded-full bg-rose-400" />
                    <span className="size-2 rounded-full bg-amber-400" />
                    <span className="size-2 rounded-full bg-emerald-400" />
                    <span className="bg-card text-warm-500 ml-2 truncate rounded px-2 py-0.5 font-mono text-[9px]">
                      hulao.id/p/madu-sumbawa
                    </span>
                  </div>
                  {/* LP content */}
                  <div className="space-y-3 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[8px] font-bold text-white uppercase">
                        New
                      </span>
                      <span className="text-[9px] font-semibold text-amber-700">
                        Madu Hutan Sumbawa
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="font-display text-warm-900 text-base leading-tight font-extrabold">
                        Daya Tahan Tubuh dari Sarang Lebah Liar
                      </div>
                      <div className="text-warm-600 text-[10px]">
                        Madu organik 100% — panen langsung dari hutan Sumbawa.
                      </div>
                    </div>
                    {/* Hero img placeholder */}
                    <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-amber-200 to-orange-300 shadow-inner" />
                    {/* Bullets */}
                    <div className="space-y-1">
                      <div className="text-warm-700 flex items-center gap-1.5 text-[9px]">
                        <span className="size-1 rounded-full bg-amber-500" />
                        Murni tanpa campuran
                      </div>
                      <div className="text-warm-700 flex items-center gap-1.5 text-[9px]">
                        <span className="size-1 rounded-full bg-amber-500" />
                        BPOM &amp; Halal
                      </div>
                      <div className="text-warm-700 flex items-center gap-1.5 text-[9px]">
                        <span className="size-1 rounded-full bg-amber-500" />
                        COD &amp; gratis ongkir Jabodetabek
                      </div>
                    </div>
                    {/* CTA */}
                    <div className="flex items-center justify-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-white shadow-md">
                      <Smartphone className="size-3" aria-hidden />
                      Pesan via WhatsApp
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badge "Generated by AI" */}
              <div className="bg-card ring-warm-200 absolute -top-3 -right-6 rotate-6 rounded-xl px-3 py-2 shadow-lg ring-1">
                <div className="text-primary-700 flex items-center gap-1.5 text-[10px] font-bold">
                  <Wand2 className="size-3" />
                  AI generated
                </div>
                <div className="text-warm-500 mt-0.5 text-[9px]">
                  via Gemini · 30 detik
                </div>
              </div>
              {/* Floating badge "WA connected" */}
              <div className="bg-card ring-warm-200 absolute -bottom-3 -left-6 -rotate-6 rounded-xl px-3 py-2 shadow-lg ring-1">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  WhatsApp connected
                </div>
                <div className="text-warm-500 mt-0.5 text-[9px]">
                  Auto-reply siap
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
