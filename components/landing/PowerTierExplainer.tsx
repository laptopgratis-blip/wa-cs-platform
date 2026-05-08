// Section khusus untuk komunikasikan fitur POWER (Order System + Auto-Confirm
// + Pixel Tracking) TANPA overwhelm calon user yang baru mulai. Tag halus
// "untuk yang udah jualan rutin" supaya yang gak fit otomatis skip section ini.
import { ArrowRight, Banknote, BarChart3, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

const advanced = [
  {
    icon: ShoppingCart,
    title: 'Form Order Profesional',
    desc: 'Form custom dengan otomatis hitung ongkir RajaOngkir, kalkulasi promo, tracking attribusi iklan.',
  },
  {
    icon: Banknote,
    title: 'Auto-Konfirmasi Pembayaran',
    desc: 'Mutasi BCA otomatis dibaca, order langsung PAID. Gak perlu cek KlikBCA tiap jam lagi.',
    badge: 'BETA',
  },
  {
    icon: BarChart3,
    title: 'Tracking Iklan Server-Side',
    desc: 'Meta CAPI, Google Ads, TikTok Pixel built-in. Iklan kamu kembali akurat walau iOS 14.5+ block cookie.',
  },
]

export function PowerTierExplainer() {
  return (
    <section className="border-y border-warm-200 bg-warm-50 py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            🚀 Khusus yang udah jualan rutin
          </span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
            Sudah produksi 100+ order/bulan?
          </h2>
          <p className="mt-3 text-warm-600">
            Paket{' '}
            <span className="font-semibold text-warm-900">POWER</span> buka
            fitur e-commerce yang biasanya butuh subscribe ke 3-4 tools beda.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
          {advanced.map(({ icon: Icon, title, desc, badge }, idx) => (
            <div
              key={title}
              className={`relative rounded-xl border border-warm-200 bg-card p-6 shadow-sm hover-lift opacity-0 animate-fade-slide-up stagger-${idx + 1}`}
            >
              {badge && (
                <span className="absolute right-4 top-4 rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                  {badge}
                </span>
              )}
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
                <Icon className="size-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-warm-900">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-warm-600">
                {desc}
              </p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-primary-200 bg-card p-6 text-center shadow-sm md:p-8">
          <div className="font-display text-2xl font-extrabold text-warm-900">
            Rp 199.000<span className="text-base font-medium text-warm-500">/bulan</span>
          </div>
          <p className="mt-2 text-sm text-warm-600">
            Tanpa kontrak. Mulai dari paket gratis dulu — upgrade saat omset
            ramai. Cancel kapan saja.
          </p>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="mt-5 h-11 rounded-full border-primary-300 bg-card px-7 font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Link href="/register">
              Mulai dari Gratis Dulu
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
