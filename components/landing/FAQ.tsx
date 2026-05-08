// FAQ — handle objection paling sering. Jangan jawab teknis, jawab dari
// sudut pandang user yang khawatir. Pakai native <details> untuk JS-free
// accordion (lebih cepat load, A11y bawaan).
const faqs = [
  {
    q: 'Customer tau gak kalau yang bales itu AI?',
    a: 'Defaultnya tidak terdeteksi karena gaya bahasa AI mengikuti "Soul" yang kamu set — bisa Bahasa Indonesia santai, sopan, atau pakai sapaan khas brand kamu. Kalau kamu mau transparan, juga bisa: set Soul untuk kasih tau "ini balasan otomatis, kalau butuh ngobrol langsung tunggu owner online".',
  },
  {
    q: 'Akun WhatsApp saya aman? Bukan dibanned kan?',
    a: 'Hulao pakai protokol Baileys — sama seperti WhatsApp Web di laptop. Bukan unofficial bot, bukan WhatsApp Business API berbayar. Akun WA pribadi/bisnis kamu tetap aman selama tidak spam (broadcast ke ribuan nomor non-kontak).',
  },
  {
    q: 'Bedanya sama Wablas, Wapanels, atau bot Shopee?',
    a: 'Wablas/Wapanels itu broadcast tool, bukan AI conversation — masih harus kamu yang nulis flow chatbot manual. Bot Shopee cuma di Shopee. Hulao = AI yang ngerti konteks pertanyaan customer, jawab nuanced (bukan template), bisa multi-channel WA, dan customer tetap chat di WA mereka sendiri (bukan platform terpisah).',
  },
  {
    q: 'Kalau token AI habis, customer terbengkalai?',
    a: 'AI berhenti reply, customer otomatis dibales template fallback yang kamu set ("CS sedang sibuk, kami balas segera"). Notifikasi ke kamu: "saldo habis". Kamu top up token, AI lanjut. Tidak ada yang ke-skip permanen.',
  },
  {
    q: 'Saya UMKM kecil, beneran masih relevan?',
    a: 'Justru lebih relevan. UMKM yang owner-nya juga handle CS sendiri = paling rugi waktu. Top up paket token paling kecil aja: AI handle pertanyaan repetitive (harga, lokasi, ongkir), kamu fokus ke chat yang penting (negosiasi, custom order). Dengan begitu mau scale ke 50 chat/hari pun masih sanggup sendirian. Setup akun-nya sendiri gratis.',
  },
  {
    q: 'Saya pakai Tokopedia/Shopee juga, ngaruh gak?',
    a: 'Tidak — Hulao hanya handle WhatsApp. Tapi banyak customer marketplace ujungnya WA juga (nanya stok, custom warna, ongkir luar kota). Itu yang ditangani Hulao. Marketplace tetap kamu kelola seperti biasa.',
  },
]

export function FAQ() {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
          Pertanyaan yang sering ditanya
        </h2>
        <p className="mt-3 text-warm-600">
          Belum yakin? Mungkin jawabannya ada di bawah ini.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {faqs.map(({ q, a }) => (
          <details
            key={q}
            className="group rounded-xl border border-warm-200 bg-card p-5 shadow-sm transition-shadow open:shadow-md"
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-display font-bold text-warm-900">
              <span>{q}</span>
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-warm-600">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
