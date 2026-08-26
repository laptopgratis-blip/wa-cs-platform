// MoreFeatures — cross-sell section: setelah user yakin LP gratis bagus,
// kasih lihat fitur lain yang Hulao punya kalau mereka mau scale lebih.
// 4 goal yang sama dengan wizard onboarding (CS_AI / SELL_LP Power /
// SELL_WA / LMS) — tapi diposisikan sebagai "fitur tambahan", bukan
// commitment. CTA per card mengarah ke detail page atau langsung register.

import {
  ArrowRight,
  Bot,
  GraduationCap,
  MessagesSquare,
  ShoppingCart,
} from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

const moreFeatures = [
  {
    icon: Bot,
    title: 'CS AI di WhatsApp',
    short: 'AI yang balas pelanggan 24/7',
    desc: 'AI yang kenal produkmu, balas customer dalam 3 detik — meski kamu tidur. Lengkap dengan inbox CRM + multi-akun WA.',
    cta: 'Lihat detail',
    href: '/cs-whatsapp',
    bg: 'from-blue-50 to-indigo-50',
    border: 'border-blue-200',
    iconBg: 'bg-blue-100 text-blue-700',
    badge: 'Free + paket token',
  },
  {
    icon: ShoppingCart,
    title: 'Sistem Order Lengkap',
    short: 'Form order, ongkir auto, follow-up',
    desc: 'Upgrade ke paket POWER: form checkout, hitung ongkir otomatis, kelola pesanan, follow-up template otomatis tiap pelanggan.',
    cta: 'Lihat paket POWER',
    href: '/pricing',
    bg: 'from-orange-50 to-amber-50',
    border: 'border-orange-200',
    iconBg: 'bg-orange-100 text-orange-700',
    badge: 'Paket POWER',
  },
  {
    icon: MessagesSquare,
    title: 'AI Sales di WhatsApp',
    short: 'AI guide pelanggan sampai closing',
    desc: 'AI tanya kebutuhan customer, kasih harga, arahkan ke COD/Transfer/Booking — semua dalam satu chat. Tanpa landing page.',
    cta: 'Pelajari',
    href: '/cs-whatsapp#sales-flow',
    bg: 'from-emerald-50 to-teal-50',
    border: 'border-emerald-200',
    iconBg: 'bg-emerald-100 text-emerald-700',
    badge: 'Paket POWER',
  },
  {
    icon: GraduationCap,
    title: 'Course / LMS',
    short: 'Jualan course online + akses auto',
    desc: 'Bikin kelas online (video/teks), murid bayar via order form, akses course otomatis dikirim. Cocok untuk content creator & coach.',
    cta: 'Lihat paket LMS',
    href: '/pricing',
    bg: 'from-purple-50 to-fuchsia-50',
    border: 'border-purple-200',
    iconBg: 'bg-purple-100 text-purple-700',
    badge: 'Paket LMS',
  },
]

export function MoreFeatures() {
  return (
    <section className="border-warm-200 from-warm-50 to-warm-50 border-y bg-gradient-to-br via-white py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="border-warm-300 bg-card text-warm-700 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium">
            Lebih dari sekadar LP
          </span>
          <h2 className="font-display text-warm-900 mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            Mau lebih dari halaman jualan?
          </h2>
          <p className="text-warm-600 mt-3">
            Pakai LP gratis dulu — kalau nanti butuh otomatisasi lebih dalam,
            Hulao punya semuanya. Satu akun, satu dashboard.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-2">
          {moreFeatures.map(
            (
              {
                icon: Icon,
                title,
                short,
                desc,
                cta,
                href,
                bg,
                border,
                iconBg,
                badge,
              },
              idx,
            ) => (
              <div
                key={title}
                className={`group rounded-2xl border-2 ${border} bg-gradient-to-br ${bg} animate-fade-slide-up p-6 opacity-0 transition hover:-translate-y-0.5 hover:shadow-md stagger-${(idx % 4) + 1}`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
                  >
                    <Icon className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-warm-900 text-base font-bold">
                        {title}
                      </h3>
                      <span className="bg-card/80 text-warm-700 ring-warm-200 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1">
                        {badge}
                      </span>
                    </div>
                    <p className="text-warm-700 mt-0.5 text-xs font-medium">
                      {short}
                    </p>
                    <p className="text-warm-600 mt-2 text-sm leading-relaxed">
                      {desc}
                    </p>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="text-warm-700 hover:bg-card hover:text-warm-900 mt-3 -ml-2 h-8 px-2 text-xs font-semibold"
                    >
                      <Link href={href}>
                        {cta} <ArrowRight className="ml-1 size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>

        <div className="border-primary-200 bg-primary-50/60 mx-auto mt-10 max-w-2xl rounded-xl border px-5 py-4 text-center">
          <p className="text-warm-700 text-sm">
            <strong>Mulai gratis dulu.</strong> Upgrade saat kamu butuh — tidak
            ada paksaan, tidak ada langganan otomatis.
          </p>
        </div>
      </div>
    </section>
  )
}
