// FAQ — answer 6 objection paling sering muncul untuk LP gratis.
// Disusun dari "ragu paling cepat" → "ragu detail teknis".

import { ChevronDown } from 'lucide-react'

const faqs = [
  {
    q: 'Bener-bener gratis selamanya, tanpa hidden cost?',
    a: 'Iya. Paket gratis include 1 LP slot + 1.000 visitor/bulan + custom slug + auto-host. Upgrade hanya kalau kamu butuh fitur lain (CS AI, Order System, dll). Tanpa kartu kredit untuk daftar.',
  },
  {
    q: 'Saya buta coding — bisa dipakai?',
    a: 'Justru itu poin utamanya. Kamu cuma isi form (nama, harga, deskripsi, WA), AI bikinkan HTML, kamu paste, lalu edit visual klik-untuk-ubah (warna, teks, gambar, link). Tidak buka satu baris HTML pun.',
  },
  {
    q: 'AI yang dipakai apa? Gratis juga?',
    a: 'Untuk wizard LP gratis, kamu pakai AI eksternal: Gemini (Google) atau Claude.ai — keduanya gratis, login pakai Google/email. Hulao kasih prompt template yang sudah optimized, kamu tinggal copy-paste.',
  },
  {
    q: 'Bisa untuk komersial / iklan berbayar?',
    a: 'Bebas. LP-mu jadi punyamu — pasang di iklan Meta/TikTok/Google Ads, share di sosmed, kirim ke chat WA. Tombol order langsung connect ke nomor WhatsApp-mu.',
  },
  {
    q: 'Berapa LP bisa saya buat di paket gratis?',
    a: '1 LP aktif di paket gratis. Mau lebih? Upgrade ke paket POWER untuk multi-LP + fitur Order System lengkap. Tapi 1 LP biasanya cukup untuk 1 produk inti — tidak perlu paksa-paksa upgrade.',
  },
  {
    q: 'Bisa custom domain? (mis. produkku.com)',
    a: 'Untuk paket gratis, slug-nya hulao.id/p/produkmu. Custom domain tersedia di paket berbayar. Tapi dari pengalaman: hulao.id/p/* sudah cukup profesional untuk jualan via iklan/sosmed — pelanggan jarang peduli domain selama LP-nya nampol.',
  },
]

export function FAQ() {
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 md:text-4xl">
          Pertanyaan yang sering muncul
        </h2>
        <p className="mt-3 text-warm-600">
          Belum dijawab di sini? Chat ke kami via tombol WhatsApp di pojok
          bawah.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-3xl space-y-3">
        {faqs.map(({ q, a }) => (
          <details
            key={q}
            className="group rounded-xl border border-warm-200 bg-card p-5 shadow-sm transition open:shadow-md"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 list-none">
              <span className="font-display text-base font-semibold text-warm-900">
                {q}
              </span>
              <ChevronDown className="size-4 shrink-0 text-warm-500 transition group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-warm-600">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
