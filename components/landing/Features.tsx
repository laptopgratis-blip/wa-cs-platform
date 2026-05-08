// 3-Act storytelling — bukan list fitur, tapi narasi transformation.
// Act 1: AI yang kenal produk (Soul + Knowledge)
// Act 2: Kontrol penuh (Inbox CRM, takeover anytime)
// Act 3: Scale tanpa hire CS (Multi-WA + Soul beda-beda)
//
// Setiap Act punya visual chat mockup mini di kanan biar engaging tapi tidak
// boros aset (pure HTML/CSS, tidak butuh image asset).
import { Bot, MessagesSquare, Phone } from 'lucide-react'

const acts = [
  {
    eyebrow: 'Act 1',
    icon: Bot,
    title: 'AI yang kenal produk kamu',
    desc: 'Set "Soul" — kepribadian AI sesuai brand. AI baca knowledge base (harga, promo, lokasi) sebelum jawab. Bukan chatbot template — bener-bener nuanced, kayak CS terbaik kamu yang kerja 24/7.',
    bullets: [
      'Soul: ramah, sopan, atau santai — pilih sesuai brand',
      'Knowledge base: AI tau harga, stok, promo, jam buka',
      'Multi-model: Claude, Gemini, atau OpenAI — pilih yg paling cocok',
    ],
    chatMock: {
      customer: 'kak harga kemeja flanel size L masih ada?',
      ai: 'Halo kak! Flanel size L stok ready 3pcs, harga Rp 245rb. Mau warna apa? (motif kotak hijau, biru, merah)',
    },
  },
  {
    eyebrow: 'Act 2',
    icon: MessagesSquare,
    title: 'Kamu tetap pegang kontrol penuh',
    desc: 'Lihat semua chat di satu inbox — bukan auto-pilot buta. Tag pipeline (NEW → INTEREST → DEAL), takeover AI kapan aja kalau ada pertanyaan custom yang butuh kamu langsung.',
    bullets: [
      'Inbox terpusat untuk semua nomor WA',
      'Pipeline 5-stage: NEW → PROSPECT → INTEREST → NEGOTIATION → CLOSED',
      'One-tap takeover: ambil alih chat dari AI kapan saja',
    ],
    chatMock: {
      customer: 'Boleh request sablon nama sendiri ga?',
      ai: '⏸️ AI di-pause — owner mengambil alih',
    },
  },
  {
    eyebrow: 'Act 3',
    icon: Phone,
    title: 'Scale tanpa hire CS lagi',
    desc: 'Punya 3 toko? 3 nomor WA dengan 3 kepribadian AI yang beda — semua di satu dashboard. Mau buka toko ke-4? Tinggal scan QR baru. Tanpa biaya per nomor, tanpa kontrak.',
    bullets: [
      'Hubungkan beberapa nomor WhatsApp sekaligus',
      'Soul berbeda per nomor (toko baju vs kedai kopi vs jasa)',
      'Tanpa biaya per akun — semua nomor pakai 1 saldo token',
    ],
    chatMock: {
      customer: '— 3 nomor aktif: Toko Baju, Kedai Kopi, Jasa Cuci —',
      ai: 'Tiga AI berjalan paralel, satu dashboard.',
    },
  },
]

export function Features() {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
          Cara kerjanya: 3 langkah dari capek ke chill
        </h2>
        <p className="mt-3 text-warm-600">
          Bukan sekadar auto-reply. Ini sistem AI + CRM + multi-akun yang
          bikin kamu bisa scale tanpa burn out.
        </p>
      </div>

      <div className="mx-auto mt-14 max-w-5xl space-y-8 md:space-y-12">
        {acts.map(({ eyebrow, icon: Icon, title, desc, bullets, chatMock }, idx) => (
          <div
            key={title}
            className={`grid gap-8 md:grid-cols-2 md:items-center ${idx % 2 === 1 ? 'md:[&>div:first-child]:order-2' : ''}`}
          >
            <div className="opacity-0 animate-fade-slide-up">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-600">
                  {eyebrow}
                </span>
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                  <Icon className="size-4" />
                </span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-extrabold leading-tight text-warm-900 md:text-3xl">
                {title}
              </h3>
              <p className="mt-3 text-warm-600">{desc}</p>
              <ul className="mt-5 space-y-2 text-sm text-warm-700">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Chat mockup (pure CSS, no asset) */}
            <div className="opacity-0 animate-fade-slide-up stagger-2">
              <div className="rounded-2xl border border-warm-200 bg-warm-50 p-4 shadow-sm md:p-5">
                <div className="flex items-center gap-2 border-b border-warm-200 pb-3">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-warm-600">
                    WhatsApp · Online
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-card px-3.5 py-2 text-sm text-warm-800 shadow-sm">
                      {chatMock.customer}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-100 px-3.5 py-2 text-sm text-emerald-900 shadow-sm">
                      {chatMock.ai}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
