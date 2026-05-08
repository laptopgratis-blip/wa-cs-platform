// Section "Yang bikin kamu capek di WhatsApp" — agitate pain point spesifik
// sebelum present solution. UMKM Indonesia relate banget dgn 4 scenario ini.
import { Clock, MessageSquareWarning, RefreshCw, Wallet } from 'lucide-react'

const pains = [
  {
    icon: Clock,
    title: 'Customer chat tengah malam',
    desc: 'Besok pagi pas kamu balas, sudah keburu pindah ke kompetitor yang fast respond.',
  },
  {
    icon: RefreshCw,
    title: '"Berapa harganya kak?" 10x sehari',
    desc: 'Pertanyaan yang sama berulang dari customer berbeda. Capek copy-paste, sering typo, kadang lupa update harga.',
  },
  {
    icon: MessageSquareWarning,
    title: 'Lupa follow-up lead',
    desc: 'Lead nanya kemarin lupa di-balas hari ini. CR jeblok, iklan kerasa boros padahal yang salah follow-up bukan iklan.',
  },
  {
    icon: Wallet,
    title: 'Cek mutasi BCA satu-satu',
    desc: 'Bukti transfer numpuk, kamu harus buka KlikBCA tiap jam buat verify. Kalau ramai, customer nunggu sampai sore baru di-konfirmasi.',
  },
]

export function ProblemAgitation() {
  return (
    <section className="border-y border-warm-200 bg-warm-50 py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warm-300 bg-card px-3 py-1.5 text-xs font-medium text-warm-700">
            😩 Pernah ngalamin?
          </span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
            Yang bikin kamu capek di WhatsApp
          </h2>
          <p className="mt-3 text-warm-600">
            Bukan jualannya yang berat — yang berat itu handle chat-nya.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
          {pains.map(({ icon: Icon, title, desc }, idx) => (
            <div
              key={title}
              className={`rounded-xl border border-warm-200 bg-card p-5 shadow-sm hover-lift opacity-0 animate-fade-slide-up stagger-${idx + 1}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-warm-900">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-warm-600">
                    {desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
