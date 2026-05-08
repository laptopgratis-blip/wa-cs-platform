// Section "Cara Kerja" — disederhanakan dari 4 step jadi 3 step (2026-05-08).
// Daftar akun di-fold ke step 1 supaya total step terlihat lebih ringan.
// Pesan sekuensial: scan QR → set Soul → AI bales.
import { ScanLine, Sparkles, Zap } from 'lucide-react'

const steps = [
  {
    num: '01',
    icon: ScanLine,
    title: 'Hubungkan WhatsApp',
    desc: 'Daftar (gratis), scan QR code dari HP — bisnis kamu langsung tertaut. 30 detik selesai.',
  },
  {
    num: '02',
    icon: Sparkles,
    title: 'Set "Soul" AI',
    desc: 'Atur kepribadian (ramah/profesional), gaya balasan, dan info produk. Template tinggal isi — tidak perlu nulis prompt panjang.',
  },
  {
    num: '03',
    icon: Zap,
    title: 'AI mulai bales',
    desc: 'Customer chat → AI jawab dalam 3 detik. Kamu lihat semua di inbox. Takeover kapan saja kalau perlu.',
  },
]

export function HowItWorks() {
  return (
    <section
      id="cara-kerja"
      className="border-y border-warm-200 bg-warm-50 py-16 md:py-24"
    >
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
            Hidup dalam 3 langkah
          </h2>
          <p className="mt-3 text-warm-600">
            Dari sign up sampai AI menjawab customer pertamamu — kurang dari 5 menit.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-8 md:grid-cols-3">
          {steps.map(({ num, icon: Icon, title, desc }, idx) => (
            <div key={title} className="relative">
              {idx < steps.length - 1 && (
                <div
                  aria-hidden
                  className="absolute left-[60%] top-7 hidden h-px w-[80%] bg-gradient-to-r from-primary-200 to-transparent md:block"
                />
              )}
              <div className="relative">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-card shadow-sm">
                  <Icon className="size-6 text-primary-500" />
                </div>
                <span className="absolute -right-1 -top-2 font-display text-2xl font-extrabold text-primary-200">
                  {num}
                </span>
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-warm-900">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-warm-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
