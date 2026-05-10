// FinalCTA — section penutup sebelum footer. Risk reversal copy + urgency
// soft (tidak ada "limited time" karena memang gratis selamanya — kasih
// FOMO dari "ribuan UMKM sudah pakai" instead).

import { ArrowRight, ShieldCheck, Timer } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export function FinalCTA() {
  return (
    <section className="border-y border-warm-200 bg-gradient-to-br from-primary-500 via-orange-500 to-amber-500 py-16 md:py-24">
      <div className="container mx-auto px-4 text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-white drop-shadow md:text-5xl">
          5 menit dari sekarang,
          <br className="hidden sm:block" /> kamu sudah punya LP siap iklan.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/95 md:text-lg">
          Daftar gratis, isi info produk, generate via AI gratis, paste, publish.
          Tidak ada kartu kredit. Tidak ada langganan otomatis.
        </p>

        <Button
          asChild
          size="lg"
          className="mt-8 h-14 rounded-full bg-white px-10 text-base font-bold text-primary-700 shadow-2xl hover:bg-warm-50"
        >
          <Link href="/register">
            Bikin LP Gratis Sekarang
            <ArrowRight className="ml-2 size-5" />
          </Link>
        </Button>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-white/95">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Tanpa kartu kredit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Free tier selamanya
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="size-3.5" />
            Setup 5 menit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Cancel kapan saja
          </span>
        </div>
      </div>
    </section>
  )
}
