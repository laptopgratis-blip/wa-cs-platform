// FAQ /pricing. Angka kuota Free diambil dari entitlement (bukan hardcode)
// supaya jawaban "kalau expired" selalu sama dengan kuota asli.
import type { PlanEntitlement } from '@/lib/plan-features'

interface FaqItem {
  q: string
  a: string
}

function buildFaq(free: PlanEntitlement): FaqItem[] {
  const n = (v: number) => v.toLocaleString('id-ID')
  return [
    {
      q: 'Bagaimana cara berlangganan?',
      a: 'Subscription LP dibayar pakai saldo token. Top-up token dulu di /billing (lewat Tripay BCA/QRIS/dll atau transfer manual), lalu pilih plan + durasi di /pricing. Token otomatis dipotong saat checkout dan akun langsung aktif, tanpa konfirmasi manual atau upload bukti transfer.',
    },
    {
      q: 'Kenapa pakai token, bukan langsung transfer?',
      a: 'Dengan token, kamu bisa upgrade atau perpanjang kapan saja tanpa input bukti transfer setiap kali. Token yang sama dipakai untuk balasan AI di WhatsApp, AI generate LP, dan optimasi LP, jadi satu saldo untuk semua.',
    },
    {
      q: 'Apakah langganan sudah termasuk token untuk fitur AI?',
      a: 'Tidak. Langganan membuka kuota dan fitur paket, tapi tidak memberi bonus token. Fitur AI (balas chat WhatsApp, bikin landing page dengan AI, optimasi di LP Lab, dan Host AI) memotong saldo token setiap kali dipakai, di paket mana pun.',
    },
    {
      q: 'Bagaimana kunjungan per bulan dihitung?',
      a: 'Batasnya berlaku untuk masing-masing landing page, bukan total akun. Setiap kali halaman dibuka dihitung satu kunjungan (bukan jumlah orang), dan hitungannya diulang dari nol setiap tanggal 1. Kalau batas tercapai, halaman itu sementara tidak bisa dibuka sampai bulan berikutnya atau sampai kamu naik paket.',
    },
    {
      q: 'Apakah ada gratis trial?',
      a: 'Tidak ada trial. Tapi kamu bisa pakai plan Free selamanya untuk fitur dasar.',
    },
    {
      q: 'Apa yang terjadi kalau subscription expired?',
      a: `Akun otomatis kembali ke plan Free pada tanggal berakhir. Tidak ada data yang dihapus: landing page tidak di-unpublish, gambar, produk, dan pesanan tetap tersimpan. Tapi kuota ikut kembali ke Free (${n(free.maxLp)} landing page, ${n(free.maxStorageMB)} MB storage, ${n(free.maxVisitorMonth)} kunjungan per halaman per bulan). Kamu belum bisa membuat halaman atau mengunggah gambar baru di atas kuota itu, dan halaman yang kunjungannya bulan ini sudah melewati ${n(free.maxVisitorMonth)} langsung tampil "tidak tersedia" sampai tanggal 1 bulan berikutnya. Form order berhenti menerima pesanan baru dan LP Lab terkunci. Semuanya kembali normal begitu kamu berlangganan lagi.`,
    },
    {
      q: 'Bisa cancel kapan saja?',
      a: 'Ya, kamu bisa cancel kapan saja dari /billing/subscription. Akses tetap aktif sampai tanggal berakhir (tidak ada refund untuk sisa periode).',
    },
    {
      q: 'Bagaimana cara perpanjang?',
      a: 'Perpanjangan tidak otomatis. Beli paket yang sama sebelum tanggal berakhir: masa aktif baru disambung dari tanggal berakhir yang lama, jadi sisa hari tidak hangus. Kami kirim pengingat 7, 3, dan 1 hari sebelum paket berakhir.',
    },
    {
      q: 'Bagaimana cara upgrade ke plan lebih tinggi?',
      a: 'Beli plan baru dengan tier lebih tinggi. Sisa masa aktif plan lama otomatis dikreditkan sebagai potongan token saat checkout, jadi tidak ada nilai yang hangus.',
    },
    {
      q: 'Bisa pindah ke plan yang lebih rendah?',
      a: 'Plan yang lebih rendah baru bisa dibeli setelah plan aktif kamu berakhir. Tidak ada pengembalian dana untuk sisa masa aktif.',
    },
    {
      q: 'Apakah paket ini termasuk Kelas Online (LMS)?',
      a: 'Tidak. Kelas Online punya paket sendiri di menu Upgrade LMS. Paket LP yang sudah termasuk Sistem Order bisa menjual kelas tersebut lewat form order, dan akses kelas terkirim otomatis setelah pesanan lunas.',
    },
  ]
}

export function PricingFaq({ free }: { free: PlanEntitlement }) {
  return (
    <section className="mx-auto max-w-3xl space-y-4 pt-6">
      <h2 className="font-display text-warm-900 text-center text-xl font-semibold">
        Pertanyaan Umum
      </h2>
      <div className="space-y-3">
        {buildFaq(free).map((item) => (
          <details key={item.q} className="group bg-card rounded-lg border p-4">
            <summary className="cursor-pointer list-none font-medium">
              <span className="text-primary-500 mr-2 inline-block transition-transform group-open:rotate-45">
                +
              </span>
              {item.q}
            </summary>
            <p className="text-muted-foreground mt-3 text-sm">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
