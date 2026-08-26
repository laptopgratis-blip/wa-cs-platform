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
      className="border-warm-200 bg-warm-50 border-y py-16 md:py-24"
    >
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="border-warm-300 bg-card text-warm-700 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium">
            Cara Kerja
          </span>
          <h2 className="font-display text-warm-900 mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">
            Dari ide produk ke LP siap iklan, 3 langkah saja
          </h2>
          <p className="text-warm-600 mt-3">
            Tidak ada coding. Tidak ada developer. AI yang bantu, kamu yang
            kuasa.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
          {steps.map(({ num, icon: Icon, title, desc, chip }, idx) => (
            <div
              key={title}
              className={`border-warm-200 bg-card hover-lift animate-fade-slide-up relative rounded-2xl border p-6 opacity-0 shadow-sm stagger-${idx + 1}`}
            >
              <div className="flex items-start justify-between">
                <div className="bg-primary-100 text-primary-600 flex size-12 items-center justify-center rounded-xl">
                  <Icon className="size-6" />
                </div>
                <span className="font-display text-primary-200 text-3xl font-extrabold">
                  {num}
                </span>
              </div>
              <span className="mt-4 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {chip}
              </span>
              <h3 className="font-display text-warm-900 mt-2 text-lg font-bold">
                {title}
              </h3>
              <p className="text-warm-600 mt-1.5 text-sm leading-relaxed">
                {desc}
              </p>
            </div>
          ))}
        </div>

        <p className="text-warm-500 mx-auto mt-8 max-w-xl text-center text-xs">
          Tidak nyaman copy-paste prompt? Hulao juga punya AI generator built-in
          (10 token per generate, untuk pengguna paket berbayar).
        </p>
      </div>
    </section>
  )
}
