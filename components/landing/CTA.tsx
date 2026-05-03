// CTA terakhir sebelum footer — bg gradient orange muda.
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export function CTA() {
  return (
    <section className="border-y border-warm-200 bg-gradient-to-br from-primary-50 via-white to-primary-50 py-16 md:py-20">
      <div className="container mx-auto px-4 text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
          Siap melayani customer 24/7?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-warm-600">
          Daftar gratis sekarang dan hubungkan WhatsApp pertamamu dalam beberapa menit.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-8 h-12 rounded-full bg-primary-500 px-8 font-semibold text-white shadow-orange hover:bg-primary-600 hover:shadow-orange-lg"
        >
          <Link href="/register">
            Mulai Gratis
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
