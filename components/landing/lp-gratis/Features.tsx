// Features — apa yang user dapat di paket gratis LP.
// Outcome-focused (bukan teknis): tampil profesional, mobile-ready, mudah
// edit, hemat bandwidth, terhubung WA.

import {
  BarChart3,
  Globe2,
  MessageCircle,
  MousePointerClick,
  Palette,
  Smartphone,
} from 'lucide-react'

const features = [
  {
    icon: MousePointerClick,
    title: 'Editor visual klik-untuk-edit',
    desc: 'Klik teks → ubah. Klik tombol → ganti link WA. Klik gambar → upload baru. Tanpa coding.',
  },
  {
    icon: Palette,
    title: 'Palet warna otomatis',
    desc: 'Auto-deteksi semua warna di LP-mu. Klik swatch → color picker → semua tempat warna itu ikut update.',
  },
  {
    icon: Smartphone,
    title: 'Mobile responsive otomatis',
    desc: '70% pelanggan buka via HP. AI-mu sudah tau — LP-mu auto-fit dari smartphone sampai desktop.',
  },
  {
    icon: MessageCircle,
    title: 'Tombol Order langsung ke WA',
    desc: 'Klik tombol di LP → buka WhatsApp dengan pesan template. AI Hulao siap balas (kalau diaktifkan).',
  },
  {
    icon: Globe2,
    title: 'Custom slug + host gratis',
    desc: 'Dapat URL hulao.id/p/nama-produkmu. 1.000 visitor/bulan free, cocok untuk traffic iklan kecil-menengah.',
  },
  {
    icon: BarChart3,
    title: 'Analytics built-in',
    desc: 'Lihat berapa view, klik tombol order, dari mana asal traffic. Tau iklan mana yang efektif.',
  },
]

export function Features() {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700">
          ✨ Yang kamu dapat
        </span>
        <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
          Lengkap untuk jualan online — gratis selamanya
        </h2>
        <p className="mt-3 text-warm-600">
          Bukan sekadar hosting HTML. Tapi platform end-to-end dari publish
          sampai closing.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, desc }, idx) => (
          <div
            key={title}
            className={`group rounded-xl border border-warm-200 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md opacity-0 animate-fade-slide-up stagger-${(idx % 4) + 1}`}
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600 transition group-hover:bg-primary-500 group-hover:text-white">
              <Icon className="size-5" />
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-warm-900">
              {title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-warm-600">
              {desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
