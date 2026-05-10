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

/**
 * Inline task kind — kalau di-set, wizard /onboarding/guide akan render
 * mini-form embedded (mis. scan QR WA, form rekening) langsung di dalam
 * wizard, tanpa user harus buka tab baru. Step kompleks (LP builder, course
 * builder) tidak punya inlineTask → fallback ke link halaman fitur.
 */
export type InlineTaskKind =
  | 'wa_connect'
  | 'bank_add'
  | 'soul_setup'
  | 'knowledge_add'
  | 'product_add'
  | 'order_form'
  | 'test_chat'
  | 'followup_on'
  | 'sales_flow'
  | 'course_add'
  | 'lesson_add'
  | 'shipping_zone'
  | 'lp_publish'
  | 'lms_subscribe'

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
  /**
   * Render inline mini-form di dalam wizard alih-alih cuma tombol "Buka
   * halaman X di tab baru". Awam tidak perlu navigasi keluar wizard.
   */
  inlineTask?: InlineTaskKind
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
      inlineTask: 'wa_connect',
      instructions: [
        'Buka WhatsApp di HP → menu (titik 3) → "Perangkat tertaut" → "Tautkan perangkat".',
        'Scan QR yang muncul di bawah pakai HP-mu.',
        'Tunggu 5-10 detik — sistem otomatis lanjut ke step berikut saat tersambung.',
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
      inlineTask: 'soul_setup',
      instructions: [
        'Kasih nama AI-mu (mis. "CS Toko Saya").',
        'Pilih gaya bicara — Ramah / Profesional / Santai.',
        'Tulis 1-2 kalimat info bisnis (apa yg dijual, target audience).',
        'Klik Simpan — wizard otomatis lanjut.',
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
      inlineTask: 'knowledge_add',
      instructions: [
        'Kasih judul (mis. "Daftar Harga", "Jam Buka", "Alamat Toko").',
        'Tempel atau ketik info-nya di kolom isi.',
        'Klik Simpan. Bisa tambah lagi nanti dari halaman Pengetahuan.',
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
      inlineTask: 'test_chat',
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
      inlineTask: 'wa_connect',
      instructions: [
        'Buka WhatsApp di HP → menu titik 3 → Perangkat Tertaut → Tautkan.',
        'Scan QR di bawah. Sistem auto-lanjut saat tersambung.',
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
      inlineTask: 'bank_add',
      instructions: [
        'Pilih bank (BCA / Mandiri / dll).',
        'Isi nomor rekening + nama pemilik.',
        'Klik Simpan — wizard otomatis lanjut.',
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
      inlineTask: 'product_add',
      instructions: [
        'Isi nama, harga, dan berat produk (gram, untuk hitung ongkir).',
        'Upload 1 foto utama (auto-resize, max 8MB).',
        'Klik Simpan. Bisa tambah varian / multi-foto / flash sale dari halaman lengkap nanti.',
      ],
    },
    {
      id: 'shipping_zone',
      title: 'Set zona ongkir',
      description: 'Bikin zona default biar form order siap terima pesanan ke semua tujuan.',
      href: '/shipping-zones',
      estimatedMin: 3,
      autoCheck: 'shipping_zone_added',
      requiresPlan: 'POWER',
      actionLabel: 'Buka Zona Ongkir',
      inlineTask: 'shipping_zone',
      instructions: [
        'Klik Simpan untuk bikin zona "default" yang berlaku ke semua tujuan.',
        'Untuk subsidi ongkir per kota / minimum order, edit dari halaman lengkap.',
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
      inlineTask: 'lp_publish',
      instructions: [
        '4 step inline: siapkan foto → upload → copy prompt ke AI (ChatGPT/Claude.ai) → tempel HTML hasil.',
        'Setelah klik "Tempel HTML & Publish" di akhir, LP otomatis online.',
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
      inlineTask: 'order_form',
      instructions: [
        'Kasih nama form (mis. "Form Pesanan Utama").',
        'Pilih produk yang ditampilkan (default: semua produk aktif).',
        'Klik Simpan. Buka halaman Form Order untuk salin link form-nya.',
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
      inlineTask: 'followup_on',
      instructions: [
        'Klik tombol di bawah → 7 template default ter-seed otomatis (reminder bayar, konfirmasi paid, info pengiriman, dll).',
        'Boleh edit kata-kata template nanti dari halaman Follow-Up.',
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
      inlineTask: 'wa_connect',
      instructions: [
        'Buka WhatsApp di HP → menu titik 3 → Perangkat Tertaut → Tautkan.',
        'Scan QR di bawah. Auto-lanjut saat tersambung.',
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
      inlineTask: 'soul_setup',
      instructions: [
        'Kasih nama AI-mu, pilih gaya bicara, isi konteks bisnis singkat.',
        'Klik Simpan — wizard auto-lanjut.',
        'Untuk tambah FAQ/info produk lebih lengkap, buka halaman Pengetahuan setelah ini.',
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
      inlineTask: 'product_add',
      instructions: [
        'Isi nama, harga, dan berat (gram).',
        'Upload 1 foto utama. Klik Simpan.',
        'Untuk varian, multi-foto, atau detail lain → buka halaman lengkap.',
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
      inlineTask: 'sales_flow',
      instructions: [
        'Pilih satu template: COD / Transfer / Booking / Konsultasi.',
        'Klik "Aktifkan template ini" — flow langsung jalan.',
        'Untuk edit step-step (pertanyaan AI), buka halaman lengkap.',
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
      inlineTask: 'bank_add',
      instructions: [
        'Pilih bank, isi nomor + nama pemilik.',
        'Klik Simpan — auto-lanjut.',
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
      inlineTask: 'lms_subscribe',
      instructions: [
        'Pilih plan (BASIC paling murah, cocok untuk course pertama).',
        'Klik Aktifkan — pembayaran otomatis dipotong dari saldo token (durasi 1 bulan).',
        'Untuk extend ke 6/12 bulan, buka halaman pricing nanti.',
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
      inlineTask: 'course_add',
      instructions: [
        'Isi judul course (mis. "Belajar Skincare 7 Hari") + deskripsi singkat.',
        'Klik Simpan — course di-create dengan status DRAFT.',
        'Tambah modul + lesson di step berikutnya atau via halaman LMS lengkap.',
      ],
    },
    {
      id: 'lesson_add',
      title: 'Tambah lesson (video / teks)',
      description: 'Konten course — embed YouTube/Vimeo atau tulis teks. Mulai dengan 1 lesson dulu.',
      href: '/lms/courses',
      estimatedMin: 10,
      autoCheck: 'lesson_added',
      requiresPlan: 'LMS',
      actionLabel: 'Kelola Course',
      inlineTask: 'lesson_add',
      instructions: [
        'Pilih tipe konten: Teks atau Video (YouTube/Vimeo embed URL).',
        'Isi judul + content. Klik Simpan — lesson masuk ke "Modul 1" otomatis.',
        'Untuk tambah lesson lain / atur ulang / drip schedule, buka halaman LMS lengkap.',
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
      inlineTask: 'product_add',
      instructions: [
        'Isi nama produk (mis. nama course-mu), harga course, berat 1 gram (digital).',
        'Upload foto thumbnail. Klik Simpan.',
        'Buka halaman Produk lengkap untuk hubungkan ke course (section "Course terhubung").',
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
      inlineTask: 'order_form',
      instructions: [
        'Kasih nama form (mis. "Daftar Course Skincare").',
        'Pilih produk course yang sudah ditambah.',
        'Klik Simpan. Buka halaman Form Order untuk salin link sebar ke pelanggan.',
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
