// Pertanyaan yang paling sering masuk ke admin. Statis (bukan dari DB) supaya
// halaman /bantuan tetap ringan dan bisa dirender di server tanpa query.
// Jawaban sengaja menyebut nama menu persis seperti di sidebar.

export interface FaqItem {
  q: string
  a: string
}

export interface FaqGroup {
  title: string
  items: FaqItem[]
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: 'WhatsApp & Koneksi',
    items: [
      {
        q: 'WhatsApp saya tiba-tiba terputus, kenapa?',
        a: 'Nomor yang terhubung lewat QR (jalur unofficial) bisa terputus kalau HP mati lama, WhatsApp di HP dipakai "Tautkan perangkat" ulang, atau sesi dihapus dari HP. Buka menu WhatsApp lalu klik "Pair Ulang" dan scan QR sekali lagi. Semua kontak dan riwayat chat tetap aman — yang diperbarui hanya sesi koneksinya.',
      },
      {
        q: 'Apa bedanya jalur unofficial (QR) dan WhatsApp Business API resmi?',
        a: 'Jalur QR gratis dan cepat dipasang, tapi ada risiko nomor dibatasi WhatsApp kalau dipakai kirim massal. Jalur resmi (Cloud API) tidak bisa diblokir sepihak dan pesannya lebih andal, tapi pesan di luar 24 jam wajib memakai template yang disetujui Meta dan berbayar per pesan. Keduanya bisa dipakai bersamaan — satu nomor untuk CS, satu nomor untuk broadcast resmi.',
      },
      {
        q: 'Balasan CS saya gagal terkirim padahal chat masuk ke inbox.',
        a: 'Biasanya karena sesi WhatsApp yang dipakai kontak itu sudah tidak aktif. Cek menu WhatsApp — pastikan minimal satu nomor berstatus CONNECTED. Kalau nomor kamu jalur resmi (Cloud API) dan customer terakhir chat lebih dari 24 jam lalu, pesan bebas memang ditolak Meta; kirim lewat tombol template di inbox.',
      },
    ],
  },
  {
    title: 'Saldo, Token, & Kredit Pesan',
    items: [
      {
        q: 'Apa bedanya biaya token AI dan biaya pesan WhatsApp resmi?',
        a: 'Dua hal terpisah. Saldo Token dibeli di hulao dan dipakai untuk semua fitur AI (balasan CS otomatis, generate konten, Live AI). Sedangkan biaya pesan template di nomor WhatsApp resmi (Cloud API) — broadcast, follow-up di luar window 24 jam, OTP — ditagih oleh Meta langsung ke metode pembayaran yang kamu pasang di WhatsApp Manager (business.facebook.com), bukan oleh hulao. Balasan CS dalam window 24 jam tidak dikenakan biaya pesan.',
      },
      {
        q: 'Berapa biaya per pesan template?',
        a: 'Tarifnya ditentukan Meta per kategori: Utility (konfirmasi order, resi, invoice), Marketing (promo, broadcast penawaran), dan Authentication (OTP) — rate card resminya ada di business.whatsapp.com. Meta menagihnya langsung ke metode pembayaran di WhatsApp Manager; pastikan kartu sudah terpasang di sana, kalau belum, kirim template berbayar akan gagal. Gratis dari Meta: template Utility yang dikirim selagi window 24 jam customer masih terbuka, dan lead dari iklan Click-to-WhatsApp selama 72 jam pertama.',
      },
      {
        q: 'Token saya habis, apa yang terjadi?',
        a: 'Balasan AI otomatis berhenti sementara dan nomor WhatsApp masuk status jeda supaya tidak ada chat yang dibalas setengah jalan. Chat yang masuk tetap tercatat di inbox dan bisa dibalas manual. Isi ulang lewat menu Billing, saldo langsung aktif setelah pembayaran terkonfirmasi.',
      },
    ],
  },
  {
    title: 'Broadcast & Follow-Up',
    items: [
      {
        q: 'Kenapa broadcast di nomor resmi harus pakai template?',
        a: 'Itu aturan Meta, bukan batasan Hulao. Pesan yang kamu mulai duluan (bukan membalas customer) wajib memakai template yang sudah disetujui Meta. Buka menu Template Meta untuk membuat atau menyiapkan template bawaan, tunggu status berubah jadi "Disetujui", baru template itu bisa dipilih saat membuat broadcast.',
      },
      {
        q: 'Template saya ditolak Meta, kenapa?',
        a: 'Penyebab paling sering: contoh nilai variabel terlalu umum (isi contoh yang konkret seperti "INV-20260820-001", bukan "nomor invoice"), isi pesan terasa promosi tapi dikirim sebagai kategori Utility, atau terlalu banyak variabel dibanding teksnya. Alasan penolakan dari Meta ditampilkan di kartu template — perbaiki lalu submit ulang.',
      },
      {
        q: 'Follow-up otomatis tidak terkirim.',
        a: 'Cek tiga hal: nomor WhatsApp masih CONNECTED, customer tidak ada di daftar Blacklist, dan (untuk nomor resmi) template Meta yang dipakai sudah disetujui serta metode pembayaran Meta di WhatsApp Manager masih aktif. Pesan yang gagal akan dicoba ulang otomatis, dan alasan kegagalannya tercatat di daftar antrean follow-up.',
      },
    ],
  },
  {
    title: 'Akun & Fitur',
    items: [
      {
        q: 'Kenapa beberapa menu tidak muncul di sidebar saya?',
        a: 'Dua sebabnya. Pertama, menu tertentu (Pesanan, Produk, Zona Ongkir, Pixel Tracking) hanya untuk paket POWER. Kedua, saat awal mendaftar kamu memilih tujuan pemakaian, dan menu yang tidak relevan disembunyikan agar tidak membingungkan — klik "Tampilkan semua menu" di bagian bawah sidebar untuk membukanya kembali.',
      },
      {
        q: 'Bagaimana cara mulai memakai API Hulao?',
        a: 'Buka menu Pengembang → API, buat kunci baru, lalu salin kuncinya (hanya ditampilkan sekali). Kirim kunci itu sebagai header Authorization: Bearer pada setiap permintaan. Contoh lengkap beserta daftar endpoint tersedia di halaman yang sama.',
      },
    ],
  },
]
