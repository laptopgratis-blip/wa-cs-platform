// CTA terakhir sebelum footer (2026-05-08) — bg gradient orange muda.
// Risk reversal copy: kasih ketenangan ke user yang masih ragu setelah
// scrolling jauh.
import { ArrowRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export function CTA() {
  return (
    <section className="border-y border-warm-200 bg-gradient-to-br from-primary-50 via-white to-primary-50 py-16 md:py-20">
      <div className="container mx-auto px-4 text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
          Customer kamu nunggu sekarang.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-warm-600">
          Daftar gratis dalam 30 detik, scan QR WhatsApp, set "Soul" AI —
          dalam 5 menit AI sudah mulai bales chat customer kamu.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-8 h-12 rounded-full bg-primary-500 px-8 font-semibold text-white shadow-orange hover:bg-primary-600 hover:shadow-orange-lg"
        >
          <Link href="/register">
            Coba Gratis Sekarang
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-warm-600">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Tanpa kartu kredit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Free tier selamanya
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Cancel kapan saja
          </span>
        </div>
      </div>
    </section>
  )
}
