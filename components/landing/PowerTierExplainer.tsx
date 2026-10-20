// Section khusus untuk komunikasikan fitur Order System (Form Order +
// Auto-Confirm + Pixel Tracking) TANPA overwhelm calon user yang baru mulai.
// Akses = paket langganan ber-flag canUseOrderSystem (lib/order-system-gate.ts),
// saat ini mulai Popular. Nama & harga paket tidak di-hardcode — diambil dari
// DB (lib/services/landing-plan.ts), detail lengkap di /pricing (butuh login).
// Tag halus "untuk yang udah jualan rutin" supaya yang gak fit otomatis skip
// section ini.
import { ArrowRight, Banknote, BarChart3, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { loginRedirectHref } from '@/lib/auth-landing'
import {
  type OrderSystemPlan,
  orderSystemPlanName,
  orderSystemPriceText,
} from '@/lib/landing-plan'

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

export function PowerTierExplainer({
  orderSystemPlan,
}: {
  orderSystemPlan: OrderSystemPlan | null
}) {
  const planName = orderSystemPlanName(orderSystemPlan)
  const priceText = orderSystemPriceText(orderSystemPlan)
  return (
    <section className="border-warm-200 bg-warm-50 border-y py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
            Khusus yang udah jualan rutin
          </span>
          <h2 className="font-display text-warm-900 mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            Sudah produksi 100+ order/bulan?
          </h2>
          <p className="text-warm-600 mt-3">
            Mulai paket{' '}
            <span className="text-warm-900 font-semibold">{planName}</span>,
            kamu dapat fitur e-commerce yang biasanya butuh subscribe ke 3-4
            tools beda.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
          {advanced.map(({ icon: Icon, title, desc, badge }, idx) => (
            <div
              key={title}
              className={`border-warm-200 bg-card hover-lift animate-fade-slide-up relative rounded-xl border p-6 opacity-0 shadow-sm stagger-${idx + 1}`}
            >
              {badge && (
                <span className="absolute top-4 right-4 rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                  {badge}
                </span>
              )}
              <div className="bg-primary-100 text-primary-600 flex size-12 items-center justify-center rounded-xl">
                <Icon className="size-6" />
              </div>
              <h3 className="font-display text-warm-900 mt-5 text-lg font-bold">
                {title}
              </h3>
              <p className="text-warm-600 mt-2 text-sm leading-relaxed">
                {desc}
              </p>
            </div>
          ))}
        </div>

        <div className="border-primary-200 bg-card mx-auto mt-12 max-w-2xl rounded-2xl border p-6 text-center shadow-sm md:p-8">
          <div className="font-display text-warm-900 text-2xl font-extrabold">
            Mulai paket {planName}
          </div>
          {priceText && (
            <p className="text-warm-700 mt-1 text-sm font-medium">
              {priceText}, dibayar pakai saldo token
            </p>
          )}
          <p className="text-warm-600 mt-2 text-sm">
            Tanpa kontrak. Mulai dari paket gratis dulu — upgrade saat omset
            ramai. Cancel kapan saja.{' '}
            <Link
              href={loginRedirectHref('/pricing')}
              className="text-primary-600 hover:underline"
            >
              Lihat rincian paket
            </Link>
          </p>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-primary-300 bg-card text-primary-700 hover:bg-primary-50 mt-5 h-11 rounded-full px-7 font-semibold"
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
