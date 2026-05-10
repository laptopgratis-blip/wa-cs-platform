// ThreeSteps — section "Cara kerjanya" untuk LP Gratis flow.
// 3 langkah konkret: Isi info → Generate via AI gratis → Paste & publish.
// Visual cards, copy outcome-focused (apa yg user dapat di tiap step).

import { ClipboardCheck, ClipboardPaste, Wand2 } from 'lucide-react'

const steps = [
  {
    num: '01',
    icon: ClipboardCheck,
    title: 'Isi info produkmu',
    desc: 'Form simple: nama, harga, deskripsi singkat, nomor WhatsApp. 1 menit selesai.',
    chip: 'Form 4 field',
  },
  {
    num: '02',
    icon: Wand2,
    title: 'AI generate HTML',
    desc: 'Klik "Generate Prompt" → copy → paste di Gemini atau Claude.ai (gratis). AI bikinkan HTML lengkap.',
    chip: 'Pakai AI gratis',
  },
  {
    num: '03',
    icon: ClipboardPaste,
    title: 'Paste & langsung publish',
    desc: 'Paste HTML hasil AI ke Hulao → tampil live di hulao.id/p/produkmu. Edit visual klik-untuk-ubah.',
    chip: 'Auto host + WA link',
  },
]

export function ThreeSteps() {
  return (
    <section
      id="cara-kerja"
      className="border-y border-warm-200 bg-warm-50 py-16 md:py-24"
    >
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warm-300 bg-card px-3 py-1.5 text-xs font-medium text-warm-700">
            ⚡ Cara Kerja
          </span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
            Dari ide produk ke LP siap iklan, 3 langkah saja
          </h2>
          <p className="mt-3 text-warm-600">
            Tidak ada coding. Tidak ada developer. AI yang bantu, kamu yang
            kuasa.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
          {steps.map(({ num, icon: Icon, title, desc, chip }, idx) => (
            <div
              key={title}
              className={`relative rounded-2xl border border-warm-200 bg-card p-6 shadow-sm hover-lift opacity-0 animate-fade-slide-up stagger-${idx + 1}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
                  <Icon className="size-6" />
                </div>
                <span className="font-display text-3xl font-extrabold text-primary-200">
                  {num}
                </span>
              </div>
              <span className="mt-4 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {chip}
              </span>
              <h3 className="mt-2 font-display text-lg font-bold text-warm-900">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-warm-600">
                {desc}
              </p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs text-warm-500">
          💡 Tidak nyaman copy-paste prompt? Hulao juga punya AI generator
          built-in (10 token per generate, untuk pengguna paket berbayar).
        </p>
      </div>
    </section>
  )
}
