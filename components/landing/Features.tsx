// 3 kolom fitur utama — clean minimal dengan icon orange-100 background.
import { Bot, MessageSquareText, Users } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

const items = [
  {
    icon: Bot,
    title: 'AI Reply 24/7',
    desc: 'AI balas pesan customer otomatis pakai kepribadian yang kamu set. Customer tidak nunggu, kamu tidak perlu standby.',
  },
  {
    icon: Users,
    title: 'CRM Terintegrasi',
    desc: 'Kontak, history pesan, dan pipeline sales semua di satu tempat. Tag customer, atur stage, ambil alih kapan perlu.',
  },
  {
    icon: MessageSquareText,
    title: 'Multi WhatsApp',
    desc: 'Hubungkan beberapa nomor WhatsApp sekaligus — masing-masing dengan kepribadian dan model AI berbeda.',
  },
]

export function Features() {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
          Semua yang kamu butuhkan untuk CS otomatis
        </h2>
        <p className="mt-3 text-warm-600">
          Tiga kapabilitas utama yang bikin platform ini cocok dari toko kecil
          sampai brand yang sudah ramai.
        </p>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {items.map(({ icon: Icon, title, desc }, idx) => (
          <Card
            key={title}
            className={`rounded-xl border-warm-200 bg-card shadow-sm hover-lift opacity-0 animate-fade-slide-up stagger-${idx + 1}`}
          >
            <CardContent className="p-6">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary-100 text-primary-500">
                <Icon className="size-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-warm-900">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-warm-600">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
