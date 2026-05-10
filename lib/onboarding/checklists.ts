// Definisi checklist per goal onboarding. Tiap step punya id stabil supaya
// state user (skipped/completed manual) bisa di-persist & match ulang setelah
// definisi diubah. Auto-check check key di-resolve di auto-check.ts.
//
// Estimasi waktu hanya panduan untuk user — bukan SLA. Bahasa Indonesia
// awam, hindari jargon platform (Soul → "kepribadian AI", Cara Jualan →
// "alur jualan otomatis", dll).

export type OnboardingGoal = 'CS_AI' | 'SELL_LP' | 'SELL_WA' | 'LMS'

export type AutoCheckKey =
  | 'wa_connected'
  | 'soul_configured'
  | 'knowledge_added'
  | 'product_added'
  | 'shipping_zone_added'
  | 'lp_published'
  | 'order_form_added'
  | 'followup_enabled'
  | 'sales_flow_added'
  | 'bank_account_added'
  | 'course_added'
  | 'lesson_added'
  | 'lms_subscribed'

export interface ChecklistStep {
  /** Stabil — disimpan ke User.onboardingChecklist JSON. */
  id: string
  title: string
  description: string
  /** Link tujuan saat user klik "Buka". */
  href: string
  /** Estimasi menit, ditampilkan di UI. */
  estimatedMin: number
  /**
   * Auto-check key. Step yang lulus auto-eval otomatis ditandai completed
   * tanpa user perlu klik. Kalau null = step manual saja (mis. "test chat").
   */
  autoCheck: AutoCheckKey | null
  /**
   * Step opsional — tetap di-render tapi visual lebih soft, dan tidak
   * dihitung di progress wajib. Default false (= wajib).
   */
  optional?: boolean
  /**
   * Plan minimum untuk step ini. UI tampilkan badge "Butuh upgrade" + CTA
   * kalau user belum punya akses.
   */
  requiresPlan?: 'POWER' | 'LMS'
  /**
   * Instruksi konkret langkah-per-langkah untuk wizard mode (dipakai di
   * /onboarding/guide). Diformat sebagai numbered list di UI.
   */
  instructions?: string[]
  /** Label tombol untuk buka halaman fitur. Default: "Buka {nama halaman}". */
  actionLabel?: string
}

export interface ChecklistDefinition {
  goal: OnboardingGoal
  title: string
  subtitle: string
  steps: ChecklistStep[]
}

const CS_AI: ChecklistDefinition = {
  goal: 'CS_AI',
  title: 'Setup CS AI WhatsApp',
  subtitle: 'Aktifkan AI yang menjawab pelanggan otomatis 24 jam.',
  steps: [
    {
      id: 'wa_connect',
      title: 'Hubungkan WhatsApp',
      description: 'AI butuh akses ke WhatsApp bisnis kamu untuk balas pesan pelanggan otomatis.',
      href: '/whatsapp',
      estimatedMin: 3,
      autoCheck: 'wa_connected',
      actionLabel: 'Buka halaman WhatsApp',
      instructions: [
        'Klik tombol "Buka halaman WhatsApp" di bawah (akan terbuka tab baru).',
        'Klik "Tambah Akun WhatsApp" → tampil QR code.',
        'Buka WhatsApp di HP → menu (titik 3) → "Perangkat tertaut" → "Tautkan perangkat".',
        'Scan QR yang ada di layar laptop. Tunggu 5-10 detik sampai status jadi "Tersambung".',
        'Tutup tab dan kembali ke sini — langkah otomatis ditandai selesai.',
      ],
    },
    {
      id: 'soul_setup',
      title: 'Atur kepribadian AI',
      description: 'Pilih gaya bicara AI saat balas pelanggan — ramah, profesional, atau santai.',
      href: '/soul',
      estimatedMin: 5,
      autoCheck: 'soul_configured',
      actionLabel: 'Buka pengaturan kepribadian',
      instructions: [
        'Klik tombol di bawah untuk buka halaman Soul (kepribadian AI).',
        'Klik "Buat Soul Baru" atau pilih salah satu template (mis. "Sari CS Ramah").',
        'Isi nama Soul (mis. "CS Toko Saya"), pilih gaya bicara, dan tambah konteks bisnis singkat.',
        'Klik "Simpan". Kembali ke sini.',
      ],
    },
    {
      id: 'knowledge_upload',
      title: 'Upload pengetahuan / FAQ',
      description: 'Kasih AI info produk, jam buka, alamat, harga — biar jawabannya akurat sesuai bisnismu.',
      href: '/knowledge',
      estimatedMin: 5,
      autoCheck: 'knowledge_added',
      actionLabel: 'Buka halaman Pengetahuan',
      instructions: [
        'Klik tombol di bawah untuk buka halaman Pengetahuan.',
        'Klik "Tambah Pengetahuan" → kasih judul (mis. "Daftar Harga", "Jam Buka").',
        'Tempel atau ketik info bisnismu. Bisa juga upload file PDF/TXT.',
        'Klik "Simpan". Tambah beberapa pengetahuan kalau perlu.',
        'Kembali ke sini setelah selesai.',
      ],
    },
    {
      id: 'test_chat',
      title: 'Test chat dengan diri sendiri',
      description: 'Pastikan AI balas sesuai harapan sebelum di-share ke pelanggan beneran.',
      href: '/inbox',
      estimatedMin: 2,
      autoCheck: null,
      actionLabel: 'Buka halaman Inbox',
      instructions: [
        'Pakai HP / nomor lain, kirim pesan ke nomor WA bisnis yang baru di-connect.',
        'Buka halaman Inbox di Hulao untuk lihat percakapan masuk + jawaban AI.',
        'Coba beberapa pertanyaan: tanya harga, jam buka, atau hal lain yang ada di pengetahuan.',
        'Kalau jawaban AI kurang pas, balik ke "Atur kepribadian AI" atau "Pengetahuan" untuk tweak.',
        'Klik "Tandai selesai" di bawah kalau sudah puas dengan jawaban AI.',
      ],
    },
  ],
}

const SELL_LP: ChecklistDefinition = {
  goal: 'SELL_LP',
  title: 'Setup jualan dengan Landing Page',
  subtitle: 'LP + form order + ongkir + follow-up otomatis. Cocok untuk traffic dari iklan.',
  steps: [
    {
      id: 'wa_connect',
      title: 'Hubungkan WhatsApp',
      description: 'WhatsApp dipakai untuk kirim notif order ke kamu + follow-up otomatis ke pelanggan.',
      href: '/whatsapp',
      estimatedMin: 3,
      autoCheck: 'wa_connected',
      actionLabel: 'Buka halaman WhatsApp',
      instructions: [
        'Klik tombol di bawah → buka halaman WhatsApp.',
        'Tambah akun → scan QR pakai HP (menu titik 3 → Perangkat Tertaut → Tautkan).',
        'Tunggu sampai status "Tersambung". Kembali ke sini.',
      ],
    },
    {
      id: 'bank_setup',
      title: 'Tambah rekening + nomor admin',
      description: 'Rekening tujuan transfer pelanggan + nomor WA admin (kamu) yang dapat notif order baru.',
      href: '/bank-accounts',
      estimatedMin: 3,
      autoCheck: 'bank_account_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka pengaturan rekening',
      instructions: [
        'Klik tombol di bawah → buka halaman Pengaturan (Rekening).',
        'Tambah minimal 1 rekening (BCA / Mandiri / dll) — nomor + nama pemilik.',
        'Set nomor WA admin di section "WA Konfirmasi" — ini nomor kamu yang dapat notif order baru.',
        'Klik Simpan, kembali ke sini.',
      ],
    },
    {
      id: 'product_add',
      title: 'Tambah produk pertama',
      description: 'Daftar produk yang akan tampil di form order: nama, harga, foto, berat (untuk hitung ongkir).',
      href: '/products',
      estimatedMin: 5,
      autoCheck: 'product_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka halaman Produk',
      instructions: [
        'Klik tombol di bawah → buka halaman Produk.',
        'Klik "Tambah Produk" → isi nama, harga, deskripsi singkat.',
        'Upload minimal 1 foto produk (max 4MB). Set berat dalam gram (penting untuk hitung ongkir).',
        'Optional: tambah varian (Size S/M/L, warna, dll).',
        'Klik Simpan. Kembali ke sini.',
      ],
    },
    {
      id: 'shipping_zone',
      title: 'Set zona ongkir',
      description: 'Tentukan kota asal pengiriman + (opsional) subsidi ongkir per area.',
      href: '/shipping-zones',
      estimatedMin: 3,
      autoCheck: 'shipping_zone_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka Zona Ongkir',
      instructions: [
        'Klik tombol di bawah → buka Zona Ongkir.',
        'Set kota asal pengiriman (di /bank-accounts → tab Pengiriman) — pakai pencarian kota.',
        'Optional: tambah zona dengan subsidi ongkir (mis. "Jakarta gratis ongkir di atas 200rb").',
        'Klik Simpan, kembali ke sini.',
      ],
    },
    {
      id: 'lp_publish',
      title: 'Bikin & publish landing page',
      description: 'Halaman jualan untuk traffic dari iklan/sosmed. Pakai AI generator (1 menit) atau template.',
      href: '/landing-pages',
      estimatedMin: 10,
      autoCheck: 'lp_published',
      actionLabel: 'Buka Landing Page Builder',
      instructions: [
        'Klik tombol di bawah → buka Landing Page.',
        'Klik "Buat LP Baru" → pilih "Generate dengan AI".',
        'Isi: nama produk, target audience, value-prop singkat. AI bikin draft full HTML.',
        'Edit kalau perlu. Klik tombol "Publish" di toolbar atas.',
        'Salin link LP-mu (mis. https://hulao.id/p/abc123) — ini yang akan kamu pasang di iklan.',
        'Kembali ke sini.',
      ],
    },
    {
      id: 'order_form',
      title: 'Bikin form order',
      description: 'Form di mana pelanggan input alamat + pilih produk + pembayaran. Link-nya bisa di-pasang di LP.',
      href: '/order-forms',
      estimatedMin: 3,
      autoCheck: 'order_form_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka Form Order',
      instructions: [
        'Klik tombol di bawah → buka Form Order.',
        'Klik "Buat Form Baru" → kasih nama (mis. "Order Skincare").',
        'Pilih produk yang akan tampil di form (default: semua produk).',
        'Salin link form (mis. /order/abc) — pasang di tombol CTA Landing Page-mu.',
        'Kembali ke sini.',
      ],
    },
    {
      id: 'followup_on',
      title: 'Aktifkan follow-up otomatis',
      description: 'Pesan otomatis ke pelanggan: "ingat untuk transfer", "barang dikirim", dll. Hemat waktu.',
      href: '/pesanan/follow-up',
      estimatedMin: 2,
      autoCheck: 'followup_enabled',
      optional: true,
      requiresPlan: 'POWER',
      actionLabel: 'Buka Follow-Up',
      instructions: [
        'Klik tombol di bawah → buka halaman Follow-Up.',
        'Klik "Aktifkan & Buat Template Default" → 7 template otomatis ter-seed (reminder bayar, konfirmasi paid, dll).',
        'Boleh edit template kalau kata-katanya mau disesuaikan.',
        'Kembali ke sini.',
      ],
    },
  ],
}

const SELL_WA: ChecklistDefinition = {
  goal: 'SELL_WA',
  title: 'Setup jualan langsung di WhatsApp',
  subtitle: 'AI tanya kebutuhan, kasih harga, langsung order — tanpa landing page.',
  steps: [
    {
      id: 'wa_connect',
      title: 'Hubungkan WhatsApp',
      description: 'Nomor WA bisnis yang akan dilayani AI saat chat masuk dari pelanggan.',
      href: '/whatsapp',
      estimatedMin: 3,
      autoCheck: 'wa_connected',
      actionLabel: 'Buka halaman WhatsApp',
      instructions: [
        'Klik tombol di bawah → halaman WhatsApp.',
        'Tambah akun → scan QR pakai HP (menu titik 3 → Perangkat Tertaut → Tautkan).',
        'Tunggu sampai status "Tersambung". Kembali ke sini.',
      ],
    },
    {
      id: 'soul_knowledge',
      title: 'Atur kepribadian + pengetahuan AI',
      description: 'Gaya bicara AI + info produk/bisnis biar AI jawab konsisten dan akurat.',
      href: '/soul',
      estimatedMin: 5,
      autoCheck: 'soul_configured',
      actionLabel: 'Buka pengaturan kepribadian',
      instructions: [
        'Klik tombol di bawah → halaman Soul.',
        'Pilih template gaya bicara (mis. "Sari CS Ramah") atau buat kustom.',
        'Isi konteks bisnis singkat (apa yang dijual, target audience).',
        'Klik Simpan. Lalu buka halaman /knowledge → tambah info produk + harga.',
        'Kembali ke sini.',
      ],
    },
    {
      id: 'product_add',
      title: 'Tambah produk',
      description: 'Daftar produk + harga. AI butuh tahu untuk kasih jawaban harga ke pelanggan.',
      href: '/products',
      estimatedMin: 5,
      autoCheck: 'product_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka halaman Produk',
      instructions: [
        'Klik tombol di bawah → halaman Produk.',
        'Tambah minimal 1 produk dengan nama + harga + foto.',
        'Klik Simpan. Kembali ke sini.',
      ],
    },
    {
      id: 'sales_flow',
      title: 'Setup alur jualan otomatis',
      description: 'AI akan ikuti alur ini saat pelanggan tertarik beli — COD, Transfer, atau Booking.',
      href: '/cara-jualan',
      estimatedMin: 10,
      autoCheck: 'sales_flow_added',
      actionLabel: 'Buka Cara Jualan',
      instructions: [
        'Klik tombol di bawah → halaman Cara Jualan.',
        'Pilih salah satu template: COD, Transfer, atau Booking. Klik "Pakai template ini".',
        'Edit step-step kalau perlu (mis. ubah pertanyaan AI).',
        'Aktifkan flow dengan toggle. Kembali ke sini.',
      ],
    },
    {
      id: 'bank_setup',
      title: 'Tambah rekening',
      description: 'Rekening tujuan transfer pelanggan setelah AI deal.',
      href: '/bank-accounts',
      estimatedMin: 3,
      autoCheck: 'bank_account_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka pengaturan rekening',
      instructions: [
        'Klik tombol di bawah → halaman Pengaturan.',
        'Tambah rekening (BCA / Mandiri / dll) — nomor + nama pemilik.',
        'Klik Simpan. Kembali ke sini.',
      ],
    },
  ],
}

const LMS: ChecklistDefinition = {
  goal: 'LMS',
  title: 'Setup jualan course / produk digital',
  subtitle: 'Bikin kelas online, kasih akses otomatis ke pelanggan setelah bayar.',
  steps: [
    {
      id: 'lms_subscribe',
      title: 'Aktifkan paket LMS',
      description: 'LMS butuh paket aktif (BASIC/PRO/UNLIMITED). Mulai dari BASIC kalau course pertama.',
      href: '/pricing-lms',
      estimatedMin: 1,
      autoCheck: 'lms_subscribed',
      requiresPlan: 'LMS',
      actionLabel: 'Buka Pricing LMS',
      instructions: [
        'Klik tombol di bawah → halaman pricing LMS.',
        'Pilih paket BASIC (cocok untuk start) atau PRO/UNLIMITED kalau target lebih banyak murid.',
        'Klik "Aktifkan" → bayar pakai token saldo.',
        'Tunggu sampai status aktif. Kembali ke sini.',
      ],
    },
    {
      id: 'course_add',
      title: 'Bikin course',
      description: 'Wadah lesson. Isi judul, deskripsi, target peserta.',
      href: '/lms/courses',
      estimatedMin: 5,
      autoCheck: 'course_added',
      requiresPlan: 'LMS',
      actionLabel: 'Buka Course Saya',
      instructions: [
        'Klik tombol di bawah → halaman Course Saya.',
        'Klik "Buat Course Baru".',
        'Isi judul (mis. "Belajar Skincare 7 Hari"), deskripsi, target peserta.',
        'Klik Simpan. Kembali ke sini.',
      ],
    },
    {
      id: 'lesson_add',
      title: 'Tambah lesson (video / teks)',
      description: 'Konten course — embed YouTube/Vimeo atau tulis teks. Mulai dengan 3-5 lesson dulu.',
      href: '/lms/courses',
      estimatedMin: 10,
      autoCheck: 'lesson_added',
      requiresPlan: 'LMS',
      actionLabel: 'Kelola Course',
      instructions: [
        'Klik tombol di bawah → buka course yang baru kamu bikin.',
        'Klik "Tambah Modul" (mis. "Pengenalan", "Tips Praktis").',
        'Di tiap modul, klik "Tambah Lesson" → pilih tipe Video Embed (YouTube/Vimeo) atau Teks.',
        'Tambah minimal 3-5 lesson. Klik Simpan tiap selesai.',
        'Optional: aktifkan drip schedule (lesson dibuka per hari).',
        'Kembali ke sini.',
      ],
    },
    {
      id: 'product_link',
      title: 'Tambah produk → link ke course',
      description: 'Buat produk yang harganya = harga course. Saat pelanggan beli, akses course otomatis dikirim.',
      href: '/products',
      estimatedMin: 3,
      autoCheck: 'product_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka halaman Produk',
      instructions: [
        'Klik tombol di bawah → halaman Produk.',
        'Klik "Tambah Produk" → isi nama (mis. nama course-mu), harga, foto thumbnail.',
        'Set berat = 0 (course digital, tidak dikirim fisik).',
        'Di section "Course terhubung", pilih course yang baru kamu bikin.',
        'Klik Simpan. Kembali ke sini.',
      ],
    },
    {
      id: 'order_form',
      title: 'Bikin form order',
      description: 'Form yang akan kamu sebar ke calon murid (di sosmed/iklan/landing page).',
      href: '/order-forms',
      estimatedMin: 3,
      autoCheck: 'order_form_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka Form Order',
      instructions: [
        'Klik tombol di bawah → halaman Form Order.',
        'Klik "Buat Form Baru" → kasih nama (mis. "Daftar Course Skincare").',
        'Pilih produk course yang baru ditambah.',
        'Salin link form (mis. /order/abc) — sebar ke pelanggan.',
        'Kembali ke sini.',
      ],
    },
  ],
}

const DEFINITIONS: Record<OnboardingGoal, ChecklistDefinition> = {
  CS_AI,
  SELL_LP,
  SELL_WA,
  LMS,
}

export function getChecklistDefinition(
  goal: OnboardingGoal,
): ChecklistDefinition {
  return DEFINITIONS[goal]
}
