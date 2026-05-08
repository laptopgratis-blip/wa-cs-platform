// Lead magnet: 1 slot LP host gratis. Customer paste HTML dari builder favorit
// (mis. ChatGPT/Claude.ai gratis di luar), Hulao deploy + connect ke WA bot.
// Generator AI in-app opsional dan butuh saldo token — bukan klaim gratis.
import { ArrowRight, Sparkles, Wand2, Zap } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

const perks = [
  '1 slot landing page, host gratis selamanya',
  '1.000 pengunjung/bulan',
  'Paste HTML dari builder favorit (ChatGPT/Claude.ai gratis di luar)',
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
              <span className="text-primary-600">Pasang gratis pakai HTML.</span>
            </h2>
            <p className="mt-4 text-warm-700 md:text-lg">
              Bikin LP di builder favorit kamu (ChatGPT, Claude.ai, Framer, dll
              — gratis di luar), copy HTML-nya, paste di Hulao. Langsung bisa
              dipakai dengan slug custom + connect ke WA bot.
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
                  Pasang LP Gratis
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-warm-500">
              Bonus: tombol order di LP langsung connect ke WA AI kamu. Customer
              klik → masuk WhatsApp → dibalas AI → closing.
            </p>
            <p className="mt-2 text-xs text-warm-500">
              Mau generate HTML otomatis langsung di Hulao? Tersedia di menu LP
              builder — pakai saldo token (10 token per generate, butuh saldo
              aktif minimal 1.000).
            </p>
          </div>

          {/* Visual mockup — input prompt → output LP */}
          <div className="relative">
            <div className="rounded-2xl border border-warm-200 bg-card p-5 shadow-lg">
              <div className="flex items-center justify-between gap-2 border-b border-warm-100 pb-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="size-4 text-primary-500" />
                  <span className="text-xs font-medium text-warm-500">
                    Paste HTML → Live LP
                  </span>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Gratis
                </span>
              </div>
              <div className="mt-3 rounded-lg bg-warm-900 p-3 font-mono text-[11px] leading-relaxed text-emerald-300">
                &lt;!DOCTYPE html&gt;
                <br />
                &lt;html&gt;
                <br />
                &nbsp;&nbsp;&lt;head&gt;…&lt;/head&gt;
                <br />
                &nbsp;&nbsp;&lt;body&gt;<span className="text-warm-400">
                  &nbsp;Madu Hutan…&nbsp;
                </span>&lt;/body&gt;
                <br />
                &lt;/html&gt;
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
